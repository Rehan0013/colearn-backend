import express from "express";
import {
    createRoomController,
    getPublicRoomsController,
    getRoomByIdController,
    joinRoomController,
    joinPublicRoomController,
    leaveRoomController,
    kickMemberController,
    updateRoomController,
    deleteRoomController,
    getMyRoomsController,
    regenerateInviteCodeController,
} from "../controllers/room.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
    createRoomValidation,
    joinRoomValidation,
    updateRoomValidation,
    roomIdValidation,
    kickMemberValidation,
    getPublicRoomsValidation,
} from "../middlewares/validator.middleware.js";

const router = express.Router();

// ─── Public ────────────────────────────────────────────────────────────────────
router.get("/", getPublicRoomsValidation, getPublicRoomsController);                          // browse public rooms

// ─── Protected ────────────────────────────────────────────────────────────────
router.use(authMiddleware); // all routes below require auth

router.post("/", createRoomValidation, createRoomController);                                 // create room
router.get("/my-rooms", getMyRoomsController);                                                // rooms I'm in
router.get("/:roomId", roomIdValidation, getRoomByIdController);                              // get room details
router.patch("/:roomId", updateRoomValidation, updateRoomController);                         // update room
router.delete("/:roomId", roomIdValidation, deleteRoomController);                            // delete room

router.post("/join", joinRoomValidation, joinRoomController);                                 // join via invite code
router.post("/:roomId/join", roomIdValidation, joinPublicRoomController);                     // join public room
router.post("/:roomId/leave", roomIdValidation, leaveRoomController);                         // leave room
router.delete("/:roomId/members/:memberId", kickMemberValidation, kickMemberController);      // kick member
router.patch("/:roomId/invite-code", roomIdValidation, regenerateInviteCodeController);       // new invite code

export default router;