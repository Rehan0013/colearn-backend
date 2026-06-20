import * as express from "express";

declare global {
    namespace Express {
        interface User {
            id: string;
            email: string;
            fullName: {
                firstName: string;
                lastName: string;
            };
        }
        interface Request {
            user?: User;
        }
    }
}
