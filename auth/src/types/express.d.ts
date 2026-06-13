import { IUserDocument } from "../models/user.model.js";

declare global {
    namespace Express {
        interface User extends IUserDocument {}
    }
}
