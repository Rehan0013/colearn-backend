import Session from "../models/session.model.js";
import UserStats from "../models/userStats.model.js";
import redis from "../db/redis.js";
import { publishToQueue } from "../broker/rabbit.js";

const SESSION_KEY = (userId, roomId) => `session:${userId}:${roomId}`;
const MIN_SESSION_MINUTES = 1; // ignore sessions under 1 minute (accidental joins)

// Streak milestones that trigger a notification
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

// ── Start Session ──────────────────────────────────────────────────────────────

export const startSession = async ({ userId, roomId, subject }) => {
    // Check if session already active for this user+room (double join guard)
    const existing = await redis.get(SESSION_KEY(userId, roomId));
    if (existing) return;

    const joinedAt = new Date();

    // Store joinedAt in Redis — fast lookup on session end
    await redis.set(
        SESSION_KEY(userId, roomId),
        JSON.stringify({ joinedAt: joinedAt.toISOString(), subject }),
        "EX",
        60 * 60 * 12 // 12 hour safety expiry
    );

    // Create session document — leftAt is null while active
    await Session.create({
        userId,
        roomId,
        subject: subject ?? "General",
        joinedAt,
        isActive: true,
    });
};

// ── End Session ────────────────────────────────────────────────────────────────

export const endSession = async ({ userId, roomId }) => {
    const cached = await redis.get(SESSION_KEY(userId, roomId));
    if (!cached) return; // no active session found

    const { joinedAt, subject } = JSON.parse(cached);
    const leftAt = new Date();
    const durationMinutes = Math.round(
        (leftAt - new Date(joinedAt)) / 1000 / 60
    );

    // Clean up Redis
    await redis.del(SESSION_KEY(userId, roomId));

    // Ignore ghost sessions under 1 minute
    if (durationMinutes < MIN_SESSION_MINUTES) {
        await Session.findOneAndDelete({ userId, roomId, isActive: true });
        return;
    }

    // Update session document
    await Session.findOneAndUpdate(
        { userId, roomId, isActive: true },
        { leftAt, durationMinutes, isActive: false },
        { sort: { joinedAt: -1 } } // update most recent active session
    );

    // Update aggregated user stats
    await updateUserStats({ userId, durationMinutes });
};

// ── Update UserStats + Streak ──────────────────────────────────────────────────

const updateUserStats = async ({ userId, durationMinutes }) => {
    const todayStr = getTodayString();

    let stats = await UserStats.findOne({ userId });

    if (!stats) {
        stats = await UserStats.create({
            userId,
            totalStudyMinutes: durationMinutes,
            streak: 1,
            lastStudyDate: todayStr,
            longestStreak: 1,
        });
        await checkStreakMilestone(userId, stats.streak);
        return;
    }

    stats.totalStudyMinutes += durationMinutes;

    // ── Streak logic ───────────────────────────────────────────────────────────
    const lastDate = stats.lastStudyDate;
    const yesterday = getYesterdayString();

    if (lastDate === todayStr) {
        // Already studied today — just add minutes, don't increment streak
    } else if (lastDate === yesterday) {
        // Studied yesterday — keep streak going
        stats.streak += 1;
        stats.lastStudyDate = todayStr;
        if (stats.streak > stats.longestStreak) {
            stats.longestStreak = stats.streak;
        }
    } else {
        // Streak broken — reset to 1
        stats.streak = 1;
        stats.lastStudyDate = todayStr;
    }

    await stats.save();

    // Publish milestone notification if needed
    await checkStreakMilestone(userId, stats.streak);

    // Sync updated stats to auth service
    publishToQueue("user.stats.updated", {
        userId,
        streak: stats.streak,
        totalStudyMinutes: stats.totalStudyMinutes
    }).catch(err => console.error("Failed to publish user stats update:", err));
};

// ── Streak milestone publisher ────────────────────────────────────────────────

const checkStreakMilestone = async (userId, streak) => {
    if (STREAK_MILESTONES.includes(streak)) {
        publishToQueue("streak.achieved", { userId, streak }).catch(() => { });
    }
};

// ── Date helpers ──────────────────────────────────────────────────────────────

const getTodayString = () => new Date().toISOString().split("T")[0]; // "2025-03-27"

const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
};