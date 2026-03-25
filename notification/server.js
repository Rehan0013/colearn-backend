import app from "./src/app.js";
import config from "./src/config/_config.js";
import startListener from "./src/broker/listener.js";
import { connect } from "./src/broker/rabbit.js";

// connect to rabbitmq
connect().then(() => {
    // start listener
    startListener();
});

// start server
app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
});
