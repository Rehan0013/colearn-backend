import app from "./src/app.js";
import config from "./src/config/_config.js";
import connectDB from "./src/db/db.js";

import { connect } from "./src/broker/rabbit.js";

const PORT = config.port;

// connect to mongodb
connectDB();

// connect to rabbitmq
connect();

// start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
