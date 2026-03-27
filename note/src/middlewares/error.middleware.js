export const errorHandler = (err, req, res, next) => {
    console.error(`[${req.method}] ${req.path} →`, err.message);

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        message: err.message || "Internal server error",
    });
};