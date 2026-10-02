const sql = require("mssql/msnodesqlv8");
require("dotenv").config();

const config = {
    connectionString:
        `Driver={ODBC Driver 18 for SQL Server};` +
        `Server=${process.env.DB_SERVER};` +
        `Database=${process.env.DB_DATABASE};` +
        `Trusted_Connection=Yes;` +
        `TrustServerCertificate=Yes;`
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {

        console.log("====================================");
        console.log("KẾT NỐI SQL SERVER THÀNH CÔNG!");
        console.log("Database: " + process.env.DB_DATABASE);
        console.log("====================================");

        return pool;
    })
    .catch(error => {

        console.log("====================================");
        console.log("LỖI KẾT NỐI SQL SERVER!");
        console.log(error);
        console.log("====================================");

        throw error;
    });

module.exports = {
    sql,
    poolPromise
};