import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,   // normalize email on save
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
            type: Date,   // track last day streak was updated
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
            // only required if not a Google OAuth user
            required: function () {
                return !this.googleId;
            },
            default: null,
        },
        isVerified: {
            type: Boolean,
            default: false, // true after OTP verification or Google OAuth
        },
        refreshToken: {
            type: String,
            default: null,  // stored here as backup (Redis is primary)
        },
    },
    {
        timestamps: true,
    }
);

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

const userModel = mongoose.model("User", userSchema);

export default userModel;