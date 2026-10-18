
require("dotenv").config();

const sql = require("mssql/msnodesqlv8");

const config = {
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "NoiThatDB",

    options: {
        trustedConnection: true,
        trustServerCertificate: true
    },

    driver: "msnodesqlv8",

    connectionString:
        "Driver={ODBC Driver 18 for SQL Server};" +
        "Server=" + (process.env.DB_SERVER || "localhost") + ";" +
        "Database=" + (process.env.DB_NAME || "NoiThatDB") + ";" +
        "Trusted_Connection=Yes;" +
        "TrustServerCertificate=Yes;"
};

const pool = new sql.ConnectionPool(config);

const poolPromise = pool.connect()
    .then(() => {
        console.log("Kết nối SQL Server thành công!");
        return pool;
    })
    .catch(err => {
        console.error("Lỗi kết nối SQL Server:", err.message);
        throw err;
    });

module.exports = { sql, poolPromise };
