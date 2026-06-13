import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    fullName: {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
    },
    avatar: {
        type: String,
        default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    },
    streak: {
        type: Number,
        default: 0,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
    lastStreakDate: {
        type: Date,
        default: null,
    },
    totalStudyMinutes: {
        type: Number,
        default: 0,
    },
    googleId: {
        type: String,
        default: null,
    },
    password: {
        type: String,
        required: function () {
            return !this.googleId;
        },
        default: null,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    refreshToken: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});
// Virtual for full display name
userSchema.virtual("displayName").get(function () {
    return `${this.fullName.firstName} ${this.fullName.lastName}`;
});
// Never return password or refreshToken in JSON responses
userSchema.set("toJSON", {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
    },
});
const userModel = mongoose.models.User || mongoose.model("User", userSchema);
export default userModel;
