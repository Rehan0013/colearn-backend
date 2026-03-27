import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,    // fast lookup by room
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        content: {
            type: String,
            default: "",
            maxlength: 500,
        },
        fileUrl: {
            type: String,
            default: null,
        },
        fileType: {
            type: String,
            enum: ["image", "audio", "video", null],
            default: null,
        },
        reactions: {
            // { "👍": ["userId1", "userId2"], "❤️": ["userId3"] }
            type: Map,
            of: [String],
            default: {},
        },
    },
    { timestamps: true }
);

// Compound index — fast paginated queries per room sorted by time
messageSchema.index({ roomId: 1, createdAt: -1 });

// Strip __v from all responses
messageSchema.set("toJSON", {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        // Convert Map to plain object for JSON serialization
        if (ret.reactions instanceof Map) {
            ret.reactions = Object.fromEntries(ret.reactions);
        }
        return ret;
    },
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
