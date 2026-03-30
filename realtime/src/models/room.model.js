import mongoose from "mongoose";
import roomDb from "../db/roomDb.js";

const roomSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
        },
        isPrivate: {
            type: Boolean,
            default: false,
        },
        inviteCode: {
            type: String,
            unique: true,   // generated via nanoid
            required: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserCache",
            required: true,
        },
        members: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "UserCache",
                },
                role: {
                    type: String,
                    enum: ["admin", "member"],
                    default: "member",
                },
                joinedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        maxMembers: {
            type: Number,
            default: 10,
        },
        tags: {
            type: [String],
            default: [],
        },
        lastActivity: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from creation
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        bannedUsers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "UserCache",
            },
        ],
    },
    { timestamps: true }
);

// Index for fast invite code lookups and browsing
roomSchema.index({ inviteCode: 1 });
roomSchema.index({ subject: 1, isPrivate: 1 });
roomSchema.index({ createdBy: 1 });

// Use the dedicated room DB connection so we query colearn-room, not colearn-chat
const Room = roomDb.model("Room", roomSchema);
export default Room;

