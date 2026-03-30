import { nanoid } from "nanoid";
import Room from "../models/room.model.js";
import redis from "../db/redis.js";
import { publishToQueue } from "../broker/rabbit.js";

const CACHE_TTL = 60 * 5; // 5 minutes

// ─── Create Room ───────────────────────────────────────────────────────────────

export const createRoomController = async (req, res, next) => {
    try {
        const { name, description, subject, isPrivate, maxMembers, tags } = req.body;
        const userId = req.user.id;

        const room = await Room.create({
            name,
            description,
            subject,
            isPrivate: isPrivate ?? false,
            inviteCode: nanoid(8), // e.g. "aB3xKp2Z"
            createdBy: userId,
            maxMembers: maxMembers ?? 10,
            tags: tags ?? [],
            members: [{ user: userId, role: "admin" }],
        });

        // Invalidate browse cache
        await redis.delByPattern("rooms:public:*");

        res.status(201).json({ message: "Room created successfully", room });
    } catch (error) {
        next(error);
    }
};

// ─── Get All Public Rooms ──────────────────────────────────────────────────────

export const getPublicRoomsController = async (req, res, next) => {
    try {
        const { subject, page = 1, limit = 10 } = req.query;
        const cacheKey = `rooms:public:${subject || "all"}:${page}`;

        // Try cache first
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        const filter = {
            isPrivate: false,
            isActive: true,
            expiresAt: { $gt: new Date() }
        };
        if (subject) filter.subject = subject;

        const rooms = await Room.find(filter)
            .populate("createdBy", "fullName")
            .sort({ lastActivity: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Room.countDocuments(filter);

        const response = {
            message: "Rooms fetched successfully",
            rooms,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
            },
        };

        // Cache result
        await redis.set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL);

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// ─── Get Room By ID ────────────────────────────────────────────────────────────

export const getRoomByIdController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const cacheKey = `room:v4:${roomId}`;

        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        const room = await Room.findById(roomId)
            .populate("createdBy", "fullName")
            .populate("members.user", "fullName");

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        // Check if user is banned
        const userId = req.user.id;
        const isBanned = room.bannedUsers?.some((id) => String(id) === String(userId));
        if (isBanned) {
            return res.status(403).json({ message: "You are banned from this room" });
        }

        const response = { message: "Room fetched successfully", room };
        // Don't cache for now if we want real-time ban enforcement per user, 
        // OR we can cache if we invalidate on kick (which we already do).
        await redis.set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL);

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// ─── Join Room via Invite Code ─────────────────────────────────────────────────

export const joinRoomController = async (req, res, next) => {
    try {
        const { inviteCode } = req.body;
        const userId = req.user.id;

        const room = await Room.findOne({ inviteCode });

        if (!room) {
            return res.status(404).json({ message: "Invalid invite code" });
        }

        // Check if banned
        const isBanned = room.bannedUsers?.some((id) => String(id) === String(userId));
        if (isBanned) {
            return res.status(403).json({ message: "You have been banned from this room" });
        }

        // Check if deactivated (only owner can join deactivated rooms)
        if (!room.isActive && String(room.createdBy) !== String(userId)) {
            return res.status(403).json({ message: "This room has been deactivated" });
        }

        // Check already a member
        const isMember = room.members.find((m) => String(m.user) === String(userId));
        const isOwner = String(room.createdBy) === String(userId);

        if (isMember) {
            // Already a member — if owner, ensure they are admin
            if (isOwner && isMember.role !== "admin") {
                // Demote current admin
                room.members.forEach((m) => {
                    if (m.role === "admin") m.role = "member";
                });
                isMember.role = "admin";
                await room.save();
                await redis.del(`room:${room._id}`);
            }
            return res.status(200).json({ message: "Already a member", room });
        }

        // Check capacity
        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: "Room is full" });
        }

        // If owner re-joins, they take back the admin role
        if (isOwner) {
            // Demote current admin
            room.members.forEach((m) => {
                if (m.role === "admin") m.role = "member";
            });
            room.members.push({ user: userId, role: "admin" });
        } else {
            room.members.push({ user: userId, role: "member" });
        }

        room.lastActivity = new Date();
        await room.save();

        // Invalidate room and browse cache
        await redis.del(`room:${room._id}`);
        await redis.delByPattern("rooms:public:*");

        res.status(200).json({ message: "Joined room successfully", room });
    } catch (error) {
        next(error);
    }
};

// ─── Join Room via ID (for public rooms) ──────────────────────────────────────

export const joinPublicRoomController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.isPrivate) {
            return res.status(403).json({ message: "This is a private room. Use an invite code." });
        }

        // Check if banned
        const isBanned = room.bannedUsers?.some((id) => String(id) === String(userId));
        if (isBanned) {
            return res.status(403).json({ message: "You have been banned from this room" });
        }

        // Check if deactivated (only owner can join deactivated rooms)
        if (!room.isActive && String(room.createdBy) !== String(userId)) {
            return res.status(403).json({ message: "This room has been deactivated" });
        }

        const isMember = room.members.find((m) => String(m.user) === String(userId));
        const isOwner = String(room.createdBy) === String(userId);

        if (isMember) {
            // Already a member — if owner, ensure they are admin
            if (isOwner && isMember.role !== "admin") {
                room.members.forEach((m) => {
                    if (m.role === "admin") m.role = "member";
                });
                isMember.role = "admin";
                await room.save();
                await redis.del(`room:${roomId}`);
            }
            return res.status(200).json({ message: "Already a member", room });
        }

        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: "Room is full" });
        }

        if (isOwner) {
            room.members.forEach((m) => {
                if (m.role === "admin") m.role = "member";
            });
            room.members.push({ user: userId, role: "admin" });
        } else {
            room.members.push({ user: userId, role: "member" });
        }

        room.lastActivity = new Date();
        await room.save();

        await redis.del(`room:${roomId}`);
        await redis.delByPattern("rooms:public:*");

        res.status(200).json({ message: "Joined room successfully", room });
    } catch (error) {
        next(error);
    }
};

// ─── Leave Room ────────────────────────────────────────────────────────────────

export const leaveRoomController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        const isMember = room.members.some((m) => String(m.user) === String(userId));
        if (!isMember) {
            return res.status(400).json({ message: "You are not a member of this room" });
        }

        // If the admin is leaving and there are other members, promote next member
        const isAdmin = room.members.find(
            (m) => String(m.user) === String(userId) && m.role === "admin"
        );

        room.members = room.members.filter((m) => m.user.toString() !== userId);

        if (isAdmin && room.members.length > 0) {
            const nextAdmin = room.members[0];
            nextAdmin.role = "admin"; // promote oldest remaining member

            // Notify about promotion for real-time UI updates
            publishToQueue("room.member.promoted", {
                roomId,
                newAdminId: nextAdmin.user.toString()
            }).catch(() => { });
        }

        // If no members left, deactivate room
        if (room.members.length === 0) {
            room.isActive = false;
        }

        await room.save();
        await redis.del(`room:${roomId}`);
        await redis.delByPattern("rooms:public:*");

        res.status(200).json({ message: "Left room successfully" });
    } catch (error) {
        next(error);
    }
};

// ─── Kick Member ───────────────────────────────────────────────────────────────

export const kickMemberController = async (req, res, next) => {
    try {
        const { roomId, memberId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        const requester = room.members.find((m) => {
            const mId = m.user?._id || m.user;
            return String(mId) === String(userId);
        });
        if (!requester || requester.role !== "admin") {
            return res.status(403).json({ message: "Only the room admin can kick members" });
        }

        // Can't kick yourself
        if (String(memberId) === String(userId)) {
            return res.status(400).json({ message: "You cannot kick yourself. Use leave room instead." });
        }

        // Can't kick the owner
        const ownerId = room.createdBy?._id || room.createdBy;
        if (String(ownerId) === String(memberId)) {
            return res.status(403).json({ message: "The room owner cannot be kicked" });
        }

        // Robust member check
        const isMember = room.members.some((m) => {
            const mId = m.user?._id || m.user;
            return String(mId) === String(memberId);
        });

        // 1. Remove from DB members list if present
        if (isMember) {
            room.members = room.members.filter((m) => {
                const mId = m.user?._id || m.user;
                return String(mId) !== String(memberId);
            });
        }

        // 2. Add to banned list (always, even if not in DB members list)
        if (!room.bannedUsers) room.bannedUsers = [];
        const isAlreadyBanned = room.bannedUsers.some(b => String(b) === String(memberId));
        if (!isAlreadyBanned) {
            room.bannedUsers.push(memberId);
        }

        await room.save();
        await redis.del(`room:${roomId}`);
        await redis.delByPattern("rooms:public:*");

        // 3. Notify realtime-service of the kick (triggers socket:kicked and presence cleanup)
        publishToQueue("room.member.kicked", { roomId, memberId }).catch(() => { });

        res.status(200).json({
            message: "Member kicked successfully",
            removedFromMembers: isMember
        });
    } catch (error) {
        next(error);
    }
};

// ─── Update Room ───────────────────────────────────────────────────────────────

export const updateRoomController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        const { name, description, subject, isPrivate, maxMembers, tags } = req.body;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        const requester = room.members.find((m) => m.user.toString() === userId);
        if (!requester || requester.role !== "admin") {
            return res.status(403).json({ message: "Only the room admin can update the room" });
        }

        if (name) room.name = name;
        if (description !== undefined) room.description = description;
        if (subject) room.subject = subject;
        if (isPrivate !== undefined) room.isPrivate = isPrivate;
        if (maxMembers) room.maxMembers = maxMembers;
        if (tags) room.tags = tags;

        await room.save();
        await redis.del(`room:${roomId}`);
        await redis.delByPattern("rooms:public:*");

        res.status(200).json({ message: "Room updated successfully", room });
    } catch (error) {
        next(error);
    }
};

// ─── Delete Room ───────────────────────────────────────────────────────────────

export const deleteRoomController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.createdBy.toString() !== userId) {
            return res.status(403).json({ message: "Only the room creator can delete the room" });
        }

        room.isActive = false;
        await room.save();

        await redis.del(`room:${roomId}`);
        await redis.delByPattern("rooms:public:*");

        // Notify other services
        publishToQueue("room.deleted", { roomId }).catch(() => { });

        res.status(200).json({ message: "Room deleted successfully" });
    } catch (error) {
        next(error);
    }
};

// ─── Get My Rooms ──────────────────────────────────────────────────────────────

export const getMyRoomsController = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const rooms = await Room.find({ "members.user": userId, isActive: true })
            .populate("createdBy", "fullName")
            .sort({ lastActivity: -1 });

        res.status(200).json({ message: "Rooms fetched successfully", rooms });
    } catch (error) {
        next(error);
    }
};

// ─── Regenerate Invite Code ────────────────────────────────────────────────────

export const regenerateInviteCodeController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);
        if (!room) return res.status(404).json({ message: "Room not found" });

        const requester = room.members.find((m) => m.user.toString() === userId);
        if (!requester || requester.role !== "admin") {
            return res.status(403).json({ message: "Only the room admin can regenerate the invite code" });
        }

        room.inviteCode = nanoid(8);
        await room.save();
        await redis.del(`room:${roomId}`);

        res.status(200).json({ message: "Invite code regenerated", inviteCode: room.inviteCode });
    } catch (error) {
        next(error);
    }
};