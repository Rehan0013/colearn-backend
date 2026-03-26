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
        await redis.del("rooms:public");

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

        const filter = { isPrivate: false };
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
        const cacheKey = `room:${roomId}`;

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

        const response = { message: "Room fetched successfully", room };
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

        // Check already a member
        const isMember = room.members.some((m) => m.user.toString() === userId);
        if (isMember) {
            return res.status(400).json({ message: "You are already a member of this room" });
        }

        // Check capacity
        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: "Room is full" });
        }

        room.members.push({ user: userId, role: "member" });
        room.lastActivity = new Date();
        await room.save();

        // Invalidate room cache
        await redis.del(`room:${room._id}`);

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

        const isMember = room.members.some((m) => m.user.toString() === userId);
        if (isMember) {
            return res.status(400).json({ message: "You are already a member of this room" });
        }

        if (room.members.length >= room.maxMembers) {
            return res.status(400).json({ message: "Room is full" });
        }

        room.members.push({ user: userId, role: "member" });
        room.lastActivity = new Date();
        await room.save();

        await redis.del(`room:${roomId}`);

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

        const isMember = room.members.some((m) => m.user.toString() === userId);
        if (!isMember) {
            return res.status(400).json({ message: "You are not a member of this room" });
        }

        // If the admin is leaving and there are other members, promote next member
        const isAdmin = room.members.find(
            (m) => m.user.toString() === userId && m.role === "admin"
        );

        room.members = room.members.filter((m) => m.user.toString() !== userId);

        if (isAdmin && room.members.length > 0) {
            room.members[0].role = "admin"; // promote oldest remaining member
        }

        // If no members left, deactivate room
        if (room.members.length === 0) {
            room.isActive = false;
        }

        await room.save();
        await redis.del(`room:${roomId}`);

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

        // Only admin can kick
        const requester = room.members.find((m) => m.user.toString() === userId);
        if (!requester || requester.role !== "admin") {
            return res.status(403).json({ message: "Only the room admin can kick members" });
        }

        // Can't kick yourself
        if (memberId === userId) {
            return res.status(400).json({ message: "You cannot kick yourself. Use leave room instead." });
        }

        const isMember = room.members.some((m) => m.user.toString() === memberId);
        if (!isMember) {
            return res.status(404).json({ message: "Member not found in room" });
        }

        room.members = room.members.filter((m) => m.user.toString() !== memberId);
        await room.save();
        await redis.del(`room:${roomId}`);

        res.status(200).json({ message: "Member kicked successfully" });
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
        await redis.del("rooms:public");

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
        await redis.del("rooms:public");

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

        const rooms = await Room.find({ "members.user": userId })
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