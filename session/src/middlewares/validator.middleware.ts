import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import mongoose from "mongoose";

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid room ID",
});

const endSessionSchema = z.object({
    body: z.object({
        roomId: objectIdSchema,
    }),
});

const historySchema = z.object({
    query: z.object({
        page: z.string()
            .optional()
            .transform((val) => val ? parseInt(val, 10) : undefined)
            .pipe(z.number().int().min(1, "Page must be a positive integer").optional())
            .or(z.undefined()),
        limit: z.string()
            .optional()
            .transform((val) => val ? parseInt(val, 10) : undefined)
            .pipe(z.number().int().min(1, "Limit must be between 1 and 100").max(100, "Limit must be between 1 and 100").optional())
            .or(z.undefined()),
    }),
});

const chartSchema = z.object({
    query: z.object({
        range: z.enum(["week", "month"], {
            message: "Range must be 'week' or 'month'"
        }).optional(),
    }),
});

const validate = (schema: z.ZodObject<any>) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Assign the parsed/coerced values back with type casts
            req.body = parsed.body || req.body;
            req.query = (parsed.query || req.query) as any;
            req.params = (parsed.params || req.params) as any;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.issues.map((err) => {
                    const location = err.path[0] as string; // "body" | "query" | "params"
                    const path = err.path.slice(1).join("."); // field name
                    const val = (req as any)[location]?.[path];
                    return {
                        type: "field",
                        value: val,
                        msg: err.message,
                        path: path,
                        location: location,
                    };
                });
                return res.status(400).json({ errors: formattedErrors });
            }
            next(error);
        }
    };
};

export const endSessionValidation = validate(endSessionSchema);
export const historyValidation = validate(historySchema);
export const chartValidation = validate(chartSchema);
