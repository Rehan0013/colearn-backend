import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String, // String to avoid casting ObjectId if the user ID isn't a valid ObjectId yet, depending on auth
            required: true,
        },
        userData: {
            // Save DB lookups by caching basic user info
            type: mongoose.Schema.Types.Mixed,
        },
        content: {
            type: String,
            default: "",
        },
        fileUrl: {
            type: String,
        },
        fileType: {
            type: String,
            enum: ["image", "video", "audio", "document"],
        },
        reactions: {
            // Store reactions as a map of emoji to arrays of userIds: { "👍": ["userId1", "userId2"] }
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        // We handle id parsing via the built-in _id in Mongoose, but we can also add a virtual for `id`
    },
    {
        timestamps: true,
    }
);

// Virtual to transform `_id` to `id` consistently with frontend usage
messageSchema.virtual("id").get(function () {
    return this._id.toHexString();
});

messageSchema.set("toJSON", {
    virtuals: true,
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
