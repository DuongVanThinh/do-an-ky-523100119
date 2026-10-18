
const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("Trang chu NOI THAT HOME hoat dong!");
});

app.get("/test", (req, res) => {
    res.send("KET NOI EXPRESS THANH CONG!");
});

app.get("/products", (req, res) => {
    res.send("DUONG DAN SAN PHAM HOAT DONG!");
});

app.listen(3001, () => {
    console.log("Server test dang chay tai http://localhost:3001");
});
