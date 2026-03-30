import mongoose from "mongoose";
import config from "../config/_config.js";

/**
 * A separate Mongoose connection that connects to the `colearn-room` database.
 * The realtime service's primary connection uses `colearn-chat` (for messages),
 * but `presence.js` and `pomodoro.js` need to look up Room documents which live
 * in the `colearn-room` database managed by the room service.
 */
const roomDb = mongoose.createConnection(config.room_mongo_uri);

roomDb.on("connected", () => console.log("Realtime service: Room DB connected"));
roomDb.on("error", (err) => console.error("Realtime service: Room DB error:", err));

export default roomDb;
