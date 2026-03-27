import mongoose from "mongoose";

const userStatsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },
        totalStudyMinutes: {
            type: Number,
            default: 0,
        },
        streak: {
            type: Number,
            default: 0,
        },
        lastStudyDate: {
            // Stored as YYYY-MM-DD string for easy date comparison
            type: String,
            default: null,
        },
        longestStreak: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

userStatsSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

const UserStats = mongoose.model("UserStats", userStatsSchema);
export default UserStats;