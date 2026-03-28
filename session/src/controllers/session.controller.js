import mongoose from "mongoose";
import Session from "../models/session.model.js";
import UserStats from "../models/userStats.model.js";
import redis from "../db/redis.js";
import { endSession } from "../utils/session.util.js";
import { publishToQueue } from "../broker/rabbit.js";

// ── Manual end session ─────────────────────────────────────────────────────────

export const endSessionController = async (req, res, next) => {
    try {
        const { roomId } = req.body;
        const userId = req.user.id;

        await endSession({ userId, roomId });

        // Also publish to RabbitMQ so realtime-service can clean up presence
        publishToQueue("session.ended", { userId, roomId }).catch(() => { });

        res.status(200).json({ message: "Session ended successfully" });
    } catch (error) {
        next(error);
    }
};

// ── Get user stats ─────────────────────────────────────────────────────────────

export const getStatsController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const cacheKey = `stats:${userId}`;

        const cached = await redis.get(cacheKey);
        if (cached) return res.status(200).json(JSON.parse(cached));

        const stats = await UserStats.findOne({ userId });

        // Calculate today's study minutes from sessions
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todaySessions = await Session.find({
            userId,
            joinedAt: { $gte: todayStart },
            isActive: false,
        });

        const todayMinutes = todaySessions.reduce(
            (sum, s) => sum + (s.durationMinutes || 0),
            0
        );

        const response = {
            message: "Stats fetched successfully",
            stats: {
                totalStudyMinutes: stats?.totalStudyMinutes ?? 0,
                streak: stats?.streak ?? 0,
                longestStreak: stats?.longestStreak ?? 0,
                lastStudyDate: stats?.lastStudyDate ?? null,
                todayMinutes,
            },
        };

        // Cache for 2 minutes — stats change after sessions end
        await redis.set(cacheKey, JSON.stringify(response), "EX", 120);

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// ── Get session history ────────────────────────────────────────────────────────

export const getHistoryController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const sessions = await Session.find({ userId, isActive: false })
            .sort({ joinedAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();

        const total = await Session.countDocuments({ userId, isActive: false });

        res.status(200).json({
            message: "History fetched successfully",
            sessions,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

// ── Get chart data ─────────────────────────────────────────────────────────────

export const getChartDataController = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { range = "week" } = req.query; // "week" | "month"
        const cacheKey = `charts:${userId}:${range}`;

        const cached = await redis.get(cacheKey);
        if (cached) return res.status(200).json(JSON.parse(cached));

        const days = range === "month" ? 30 : 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (days - 1));
        startDate.setHours(0, 0, 0, 0);

        // Aggregate minutes per day using MongoDB pipeline
        const dailyData = await Session.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    isActive: false,
                    joinedAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$joinedAt" },
                    },
                    minutes: { $sum: "$durationMinutes" },
                    sessions: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Build full date range — fill in zeros for days with no sessions
        const chartData = buildDateRange(days, dailyData);

        const response = {
            message: "Chart data fetched successfully",
            range,
            data: chartData,
            // Summary for chart header
            summary: {
                totalMinutes: chartData.reduce((sum, d) => sum + d.minutes, 0),
                totalSessions: chartData.reduce((sum, d) => sum + d.sessions, 0),
                activeDays: chartData.filter((d) => d.minutes > 0).length,
            },
        };

        // Cache for 5 minutes
        await redis.set(cacheKey, JSON.stringify(response), "EX", 300);

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// ── Active session check ───────────────────────────────────────────────────────

export const getActiveSessionController = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const active = await Session.findOne({ userId, isActive: true })
            .sort({ joinedAt: -1 })
            .lean();

        res.status(200).json({
            message: "Active session fetched",
            session: active ?? null,
        });
    } catch (error) {
        next(error);
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a full array of { date, minutes, sessions } for every day in range.
 * Days with no sessions get minutes: 0, sessions: 0.
 * This ensures Recharts always gets a complete dataset with no gaps.
 */
const buildDateRange = (days, dbData) => {
    const map = new Map(dbData.map((d) => [d._id, d]));
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const entry = map.get(dateStr);
        result.push({
            date: dateStr,
            minutes: entry?.minutes ?? 0,
            sessions: entry?.sessions ?? 0,
        });
    }

    return result;
};