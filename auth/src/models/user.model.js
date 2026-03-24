import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    fullName: {
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
    },
    avatar: {
        type: String,
        default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        required: true,
    },
    streak: {
        type: Number,
        default: 0,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
    totalStudyMinutes: {
        type: Number,
        default: 0,
    },
    googleId: {
        type: String,
    },
    password: {
        type: String,
        required: function () {
            return !this.googleId;
        },
    },
}, {
    timestamps: true,
});

const userModel = mongoose.model("user", userSchema);

export default userModel;