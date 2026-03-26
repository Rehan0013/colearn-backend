import express from "express";
import multer from "multer";
import { uploadFile } from "../services/storage.service.js";

const router = express.Router();

// Use memory storage to keep file in memory as Buffer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // Limit to 50MB
});

router.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file provided" });
        }

        const fileUrl = await uploadFile(req.file.buffer, req.file.originalname);

        // Determine general file type for frontend handling
        let fileType = "document";
        if (req.file.mimetype.startsWith("image/")) fileType = "image";
        else if (req.file.mimetype.startsWith("video/")) fileType = "video";
        else if (req.file.mimetype.startsWith("audio/")) fileType = "audio";

        res.status(200).json({
            success: true,
            url: fileUrl,
            type: fileType,
            name: req.file.originalname,
        });
    } catch (error) {
        console.error("Realtime service: File upload error:", error);
        res.status(500).json({ success: false, message: "File upload failed", error: error.message });
    }
});

export default router;
