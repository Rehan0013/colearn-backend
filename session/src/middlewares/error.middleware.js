export const errorHandler = (err, req, res, next) => {
    console.error(`[${req.method}] ${req.path} →`, err.message);
    res.status(err.statusCode || 500).json({
        message: err.message || "Internal server error",
    });
};