const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
require("dotenv").config();
// =====================================================
// CẤU HÌNH UPLOAD ẢNH SẢN PHẨM
// =====================================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            path.join(
                __dirname,
                "public",
                "images",
                "products"
            )
        );

    },

    filename: function (req, file, cb) {

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            path.extname(file.originalname);

        cb(null, uniqueName);

    }

});


const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {

            cb(null, true);

        } else {

            cb(
                new Error(
                    "Chỉ được chọn ảnh JPG, PNG hoặc WEBP"
                )
            );

        }

    }
});
const {
    sql,
    poolPromise
} = require("./config/database");

const app = express();
app.set("view engine", "ejs");

app.use(express.static("public"));

app.use(express.urlencoded({
    extended: true
}));

app.use(express.json());
app.use(session({

    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
        maxAge: 1000 * 60 * 60 * 2
    }

}));
app.use((req, res, next) => {

    res.locals.user = req.session.user || null;

    next();

});
// ====================================
// TRANG CHỦ
// ====================================

app.get("/", async (req, res) => {

    try {

        const pool = await poolPromise;

        const result = await pool
            .request()
            .query(`
                SELECT
                    p.product_id,
                    p.product_name,
                    p.price,
                    p.stock_quantity,
                    p.description,
                    p.image_url,
                    c.category_name
                FROM products p

                INNER JOIN categories c
                    ON p.category_id = c.category_id

                WHERE p.is_active = 1

                ORDER BY p.product_id DESC
            `);

        res.render("index", {
            products: result.recordset
        });

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Có lỗi khi tải trang chủ NỘI THẤT HOME"
        );

    }

});


// ====================================
// KIỂM TRA DATABASE
// ====================================

app.get("/test-database", async (req, res) => {

    try {

        const pool = await poolPromise;

        const result = await pool
            .request()
            .query("SELECT DB_NAME() AS database_name");

        res.send(`
            <h1>NỘI THẤT HOME</h1>

            <h2>Kết nối Database thành công!</h2>

            <p>
                Database hiện tại:
                <strong>
                    ${result.recordset[0].database_name}
                </strong>
            </p>

            <a href="/">
                Quay lại trang chủ
            </a>
        `);

    } catch (error) {

        console.log(error);

        res.status(500).send(`
            <h1>Lỗi kết nối Database</h1>

            <p>
                Hãy kiểm tra Terminal trong Visual Studio Code.
            </p>
        `);

    }

});


// ====================================
// SERVER
// ====================================

const PORT = process.env.PORT || 3000;
app.get("/test-products", async (req, res) => {

    try {

        const pool = await poolPromise;

        const result = await pool
            .request()
            .query(`
                SELECT *
                FROM products
            `);

        res.json(result.recordset);

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Không đọc được bảng products"
        );

    }

});
app.get("/products", async (req, res) => {

    try {

        const pool = await poolPromise;

        const result = await pool
            .request()
            .query(`
                SELECT
                    p.product_id,
                    p.product_name,
                    p.price,
                    p.stock_quantity,
                    p.description,
                    p.image_url,
                    p.category_id,
                    c.category_name

                FROM products p

                INNER JOIN categories c
                    ON p.category_id = c.category_id

                WHERE p.is_active = 1

                ORDER BY p.product_id DESC
            `);

        res.render("products/list", {
            products: result.recordset,
            keyword: "",
            category: ""
        });

    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Không thể tải danh sách sản phẩm."
        );

    }

});
app.get("/products/search", async (req, res) => {

    try {

        const keyword = req.query.keyword || "";
        const category = req.query.category || "";

        const pool = await poolPromise;

        const request = pool.request();

        request.input(
            "keyword",
            sql.NVarChar,
            `%${keyword}%`
        );

        let query = `
            SELECT
                p.product_id,
                p.product_name,
                p.price,
                p.stock_quantity,
                p.description,
                p.image_url,
                p.category_id,
                c.category_name

            FROM products p

            INNER JOIN categories c
                ON p.category_id = c.category_id

            WHERE
                p.is_active = 1

                AND p.product_name
                    LIKE @keyword
        `;


        if (category !== "") {

            request.input(
                "category_id",
                sql.Int,
                parseInt(category)
            );

            query += `
                AND p.category_id = @category_id
            `;

        }


        query += `
            ORDER BY p.product_id DESC
        `;


        const result = await request.query(query);


        res.render("products/list", {

            products: result.recordset,

            keyword: keyword,

            category: category

        });


    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Có lỗi khi tìm kiếm sản phẩm."
        );

    }

});
app.get("/products/:id", async (req, res) => {

    try {

        const productId = parseInt(req.params.id);

        if (isNaN(productId)) {

            return res.status(400).send(
                "Mã sản phẩm không hợp lệ."
            );

        }


        const pool = await poolPromise;

        const result = await pool
            .request()

            .input(
                "product_id",
                sql.Int,
                productId
            )

            .query(`
                SELECT
                    p.product_id,
                    p.product_name,
                    p.price,
                    p.stock_quantity,
                    p.description,
                    p.image_url,
                    p.category_id,
                    c.category_name

                FROM products p

                INNER JOIN categories c
                    ON p.category_id = c.category_id

                WHERE
                    p.product_id = @product_id
                    AND p.is_active = 1
            `);


        if (result.recordset.length === 0) {

            return res.status(404).send(
                "Không tìm thấy sản phẩm."
            );

        }


        res.render("products/detail", {

            product: result.recordset[0]

        });


    } catch (error) {

        console.log(error);

        res.status(500).send(
            "Có lỗi khi tải chi tiết sản phẩm."
        );

    }

});
app.get("/register", (req, res) => {

    res.render("auth/register", {

        error: null,

        success: null

    });

});
app.post("/register", async (req, res) => {

    const {
        full_name,
        email,
        phone,
        password,
        confirm_password
    } = req.body;


    try {

        // ============================
        // KIỂM TRA DỮ LIỆU
        // ============================

        if (
            !full_name ||
            !email ||
            !password ||
            !confirm_password
        ) {

            return res.render(
                "auth/register",
                {
                    error:
                        "Vui lòng nhập đầy đủ thông tin bắt buộc.",

                    success: null
                }
            );

        }


        if (password.length < 6) {

            return res.render(
                "auth/register",
                {
                    error:
                        "Mật khẩu phải có ít nhất 6 ký tự.",

                    success: null
                }
            );

        }


        if (password !== confirm_password) {

            return res.render(
                "auth/register",
                {
                    error:
                        "Hai mật khẩu không giống nhau.",

                    success: null
                }
            );

        }


        const pool = await poolPromise;


        // ============================
        // KIỂM TRA EMAIL
        // ============================

        const checkEmail = await pool
            .request()

            .input(
                "email",
                sql.VarChar,
                email
            )

            .query(`
                SELECT user_id
                FROM users
                WHERE email = @email
            `);


        if (checkEmail.recordset.length > 0) {

            return res.render(
                "auth/register",
                {
                    error:
                        "Email này đã được sử dụng.",

                    success: null
                }
            );

        }


        // ============================
        // MÃ HÓA MẬT KHẨU
        // ============================

        const passwordHash =
            await bcrypt.hash(
                password,
                10
            );


        // ============================
        // TRANSACTION
        // ============================

        const transaction =
            new sql.Transaction(pool);

        await transaction.begin();


        try {

            const request =
                new sql.Request(transaction);


            const userResult =
                await request

                    .input(
                        "full_name",
                        sql.NVarChar,
                        full_name
                    )

                    .input(
                        "email",
                        sql.VarChar,
                        email
                    )

                    .input(
                        "password_hash",
                        sql.VarChar,
                        passwordHash
                    )

                    .input(
                        "phone",
                        sql.VarChar,
                        phone || null
                    )

                    .query(`
                        INSERT INTO users
                        (
                            full_name,
                            email,
                            password_hash,
                            phone,
                            role
                        )

                        OUTPUT INSERTED.user_id

                        VALUES
                        (
                            @full_name,
                            @email,
                            @password_hash,
                            @phone,
                            'customer'
                        )
                    `);


            const newUserId =
                userResult.recordset[0].user_id;


            const cartRequest =
                new sql.Request(transaction);


            await cartRequest

                .input(
                    "user_id",
                    sql.Int,
                    newUserId
                )

                .query(`
                    INSERT INTO cart
                    (
                        user_id,
                        updated_at
                    )

                    VALUES
                    (
                        @user_id,
                        GETDATE()
                    )
                `);


            await transaction.commit();


            return res.render(
                "auth/register",
                {
                    error: null,

                    success:
                        "Đăng ký thành công! Bạn có thể đăng nhập."
                }
            );


        } catch (error) {

            await transaction.rollback();

            throw error;

        }


    } catch (error) {

        console.log(
            "Lỗi đăng ký:",
            error
        );


        res.render(
            "auth/register",
            {
                error:
                    "Có lỗi xảy ra khi đăng ký tài khoản.",

                success: null
            }
        );

    }

});
app.get("/login", (req, res) => {

    if (req.session.user) {

        return res.redirect("/");

    }


    res.render(
        "auth/login",
        {
            error: null
        }
    );

});
app.post("/login", async (req, res) => {

    const {
        email,
        password
    } = req.body;


    try {

        if (!email || !password) {

            return res.render(
                "auth/login",
                {
                    error:
                        "Vui lòng nhập email và mật khẩu."
                }
            );

        }


        const pool = await poolPromise;


        const result = await pool
            .request()

            .input(
                "email",
                sql.VarChar,
                email
            )

            .query(`
                SELECT
                    user_id,
                    full_name,
                    email,
                    password_hash,
                    phone,
                    role

                FROM users

                WHERE email = @email
            `);


        if (result.recordset.length === 0) {

            return res.render(
                "auth/login",
                {
                    error:
                        "Email hoặc mật khẩu không chính xác."
                }
            );

        }


        const user =
            result.recordset[0];


        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordCorrect) {

            return res.render(
                "auth/login",
                {
                    error:
                        "Email hoặc mật khẩu không chính xác."
                }
            );

        }


        // =======================
        // TẠO SESSION
        // =======================

        req.session.user = {

            user_id:
                user.user_id,

            full_name:
                user.full_name,

            email:
                user.email,

            role:
                user.role

        };


        // =======================
        // ADMIN
        // =======================

        if (user.role === "admin") {

            return res.redirect(
                "/admin"
            );

        }


        // =======================
        // CUSTOMER
        // =======================

        res.redirect("/");


    } catch (error) {

        console.log(
            "Lỗi đăng nhập:",
            error
        );


        res.render(
            "auth/login",
            {
                error:
                    "Có lỗi xảy ra khi đăng nhập."
            }
        );

    }

});
app.get("/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.log(error);

            return res.send(
                "Không thể đăng xuất."
            );

        }

        res.redirect("/login");

    });

});
// ==========================================
// THÊM SẢN PHẨM VÀO GIỎ HÀNG
// ==========================================

app.post(
    "/cart/add",
    requireLogin,
    async (req, res) => {

        try {

            const userId = req.session.user.user_id;

            const productId =
                parseInt(req.body.product_id);

            const quantity =
                parseInt(req.body.quantity) || 1;


            // Kiểm tra mã sản phẩm
            if (
                isNaN(productId) ||
                quantity < 1
            ) {

                return res.status(400).send(
                    "Thông tin sản phẩm không hợp lệ."
                );

            }


            const pool = await poolPromise;


            // =================================
            // 1. KIỂM TRA SẢN PHẨM
            // =================================

            const productResult =
                await pool
                    .request()

                    .input(
                        "product_id",
                        sql.Int,
                        productId
                    )

                    .query(`
                        SELECT
                            product_id,
                            product_name,
                            stock_quantity

                        FROM products

                        WHERE
                            product_id = @product_id
                            AND is_active = 1
                    `);


            if (
                productResult.recordset.length === 0
            ) {

                return res.status(404).send(
                    "Không tìm thấy sản phẩm."
                );

            }


            const product =
                productResult.recordset[0];


            if (
                quantity >
                product.stock_quantity
            ) {

                return res.status(400).send(
                    "Số lượng bạn chọn vượt quá số lượng tồn kho."
                );

            }


            // =================================
            // 2. TÌM GIỎ HÀNG CỦA USER
            // =================================

            let cartResult =
                await pool
                    .request()

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT cart_id

                        FROM cart

                        WHERE user_id = @user_id
                    `);


            let cartId;


            // =================================
            // 3. NẾU CHƯA CÓ GIỎ → TẠO GIỎ
            // =================================

            if (
                cartResult.recordset.length === 0
            ) {

                const newCartResult =
                    await pool
                        .request()

                        .input(
                            "user_id",
                            sql.Int,
                            userId
                        )

                        .query(`
                            INSERT INTO cart
                            (
                                user_id,
                                updated_at
                            )

                            OUTPUT INSERTED.cart_id

                            VALUES
                            (
                                @user_id,
                                GETDATE()
                            )
                        `);


                cartId =
                    newCartResult
                        .recordset[0]
                        .cart_id;

            }
            else {

                cartId =
                    cartResult
                        .recordset[0]
                        .cart_id;

            }


            // =================================
            // 4. KIỂM TRA SẢN PHẨM ĐÃ CÓ
            //    TRONG GIỎ CHƯA
            // =================================

            const itemResult =
                await pool
                    .request()

                    .input(
                        "cart_id",
                        sql.Int,
                        cartId
                    )

                    .input(
                        "product_id",
                        sql.Int,
                        productId
                    )

                    .query(`
                        SELECT
                            cart_item_id,
                            quantity

                        FROM cart_items

                        WHERE
                            cart_id = @cart_id
                            AND product_id = @product_id
                    `);


            // =================================
            // 5A. ĐÃ CÓ → CỘNG SỐ LƯỢNG
            // =================================

            if (
                itemResult.recordset.length > 0
            ) {

                const oldQuantity =
                    itemResult
                        .recordset[0]
                        .quantity;

                const newQuantity =
                    oldQuantity + quantity;


                if (
                    newQuantity >
                    product.stock_quantity
                ) {

                    return res.status(400).send(
                        "Tổng số lượng trong giỏ vượt quá số lượng tồn kho."
                    );

                }


                await pool
                    .request()

                    .input(
                        "cart_id",
                        sql.Int,
                        cartId
                    )

                    .input(
                        "product_id",
                        sql.Int,
                        productId
                    )

                    .input(
                        "quantity",
                        sql.Int,
                        newQuantity
                    )

                    .query(`
                        UPDATE cart_items

                        SET quantity = @quantity

                        WHERE
                            cart_id = @cart_id
                            AND product_id = @product_id
                    `);

            }

            // =================================
            // 5B. CHƯA CÓ → INSERT
            // =================================

            else {

                await pool
                    .request()

                    .input(
                        "cart_id",
                        sql.Int,
                        cartId
                    )

                    .input(
                        "product_id",
                        sql.Int,
                        productId
                    )

                    .input(
                        "quantity",
                        sql.Int,
                        quantity
                    )

                    .query(`
                        INSERT INTO cart_items
                        (
                            cart_id,
                            product_id,
                            quantity
                        )

                        VALUES
                        (
                            @cart_id,
                            @product_id,
                            @quantity
                        )
                    `);

            }


            // Cập nhật thời gian giỏ hàng

            await pool
                .request()

                .input(
                    "cart_id",
                    sql.Int,
                    cartId
                )

                .query(`
                    UPDATE cart

                    SET updated_at = GETDATE()

                    WHERE cart_id = @cart_id
                `);


            // Thêm xong → chuyển đến giỏ

            return res.redirect("/cart");


        }
        catch (error) {

            console.log(
                "Lỗi thêm giỏ hàng:",
                error
            );

            return res.status(500).send(
                "Có lỗi khi thêm sản phẩm vào giỏ hàng."
            );

        }

    }
);
// ==========================================
// XEM GIỎ HÀNG
// ==========================================

app.get(
    "/cart",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const pool =
                await poolPromise;


            const result =
                await pool
                    .request()

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            ci.cart_item_id,
                            ci.quantity,

                            p.product_id,
                            p.product_name,
                            p.price,
                            p.image_url,
                            p.stock_quantity,

                            (
                                p.price *
                                ci.quantity
                            ) AS subtotal

                        FROM cart c

                        INNER JOIN cart_items ci
                            ON c.cart_id = ci.cart_id

                        INNER JOIN products p
                            ON ci.product_id =
                               p.product_id

                        WHERE
                            c.user_id = @user_id

                        ORDER BY
                            ci.cart_item_id DESC
                    `);


            const items =
                result.recordset;


            // ===============================
            // TÍNH TỔNG TIỀN
            // ===============================

            let total = 0;


            items.forEach(item => {

                total +=
                    Number(item.subtotal);

            });


            res.render(
                "cart/index",
                {

                    items: items,

                    total: total

                }
            );


        }
        catch (error) {

            console.log(
                "Lỗi xem giỏ hàng:",
                error
            );

            res.status(500).send(
                "Không thể tải giỏ hàng."
            );

        }

    }
);
// ==========================================
// CẬP NHẬT SỐ LƯỢNG GIỎ HÀNG
// ==========================================

app.post(
    "/cart/update",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const cartItemId =
                parseInt(
                    req.body.cart_item_id
                );

            const quantity =
                parseInt(
                    req.body.quantity
                );


            if (
                isNaN(cartItemId) ||
                isNaN(quantity) ||
                quantity < 1
            ) {

                return res.status(400).send(
                    "Số lượng không hợp lệ."
                );

            }


            const pool =
                await poolPromise;


            // Lấy sản phẩm và kiểm tra
            // cart_item có thuộc user này không

            const itemResult =
                await pool
                    .request()

                    .input(
                        "cart_item_id",
                        sql.Int,
                        cartItemId
                    )

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            ci.cart_item_id,
                            ci.cart_id,
                            ci.product_id,
                            p.stock_quantity

                        FROM cart_items ci

                        INNER JOIN cart c
                            ON ci.cart_id =
                               c.cart_id

                        INNER JOIN products p
                            ON ci.product_id =
                               p.product_id

                        WHERE
                            ci.cart_item_id =
                                @cart_item_id

                            AND c.user_id =
                                @user_id
                    `);


            if (
                itemResult.recordset.length === 0
            ) {

                return res.status(404).send(
                    "Không tìm thấy sản phẩm trong giỏ."
                );

            }


            const item =
                itemResult.recordset[0];


            if (
                quantity >
                item.stock_quantity
            ) {

                return res.status(400).send(
                    "Số lượng vượt quá tồn kho."
                );

            }


            await pool
                .request()

                .input(
                    "cart_item_id",
                    sql.Int,
                    cartItemId
                )

                .input(
                    "quantity",
                    sql.Int,
                    quantity
                )

                .query(`
                    UPDATE cart_items

                    SET quantity = @quantity

                    WHERE
                        cart_item_id =
                        @cart_item_id
                `);


            // cập nhật thời gian giỏ

            await pool
                .request()

                .input(
                    "cart_id",
                    sql.Int,
                    item.cart_id
                )

                .query(`
                    UPDATE cart

                    SET updated_at = GETDATE()

                    WHERE cart_id = @cart_id
                `);


            return res.redirect("/cart");


        }
        catch (error) {

            console.log(
                "Lỗi cập nhật giỏ:",
                error
            );

            return res.status(500).send(
                "Không thể cập nhật giỏ hàng."
            );

        }

    }
);
// ==========================================
// XÓA SẢN PHẨM KHỎI GIỎ
// ==========================================

app.post(
    "/cart/remove",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const cartItemId =
                parseInt(
                    req.body.cart_item_id
                );


            if (isNaN(cartItemId)) {

                return res.status(400).send(
                    "Dữ liệu không hợp lệ."
                );

            }


            const pool =
                await poolPromise;


            // Chỉ được xóa item thuộc
            // giỏ hàng của chính user

            const result =
                await pool
                    .request()

                    .input(
                        "cart_item_id",
                        sql.Int,
                        cartItemId
                    )

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        DELETE ci

                        FROM cart_items ci

                        INNER JOIN cart c
                            ON ci.cart_id =
                               c.cart_id

                        WHERE
                            ci.cart_item_id =
                                @cart_item_id

                            AND c.user_id =
                                @user_id
                    `);


            if (result.rowsAffected[0] === 0) {

                return res.status(404).send(
                    "Không tìm thấy sản phẩm trong giỏ."
                );

            }


            return res.redirect("/cart");


        }
        catch (error) {

            console.log(
                "Lỗi xóa sản phẩm:",
                error
            );

            return res.status(500).send(
                "Không thể xóa sản phẩm."
            );

        }

    }
);
// ==========================================
// TRANG CHECKOUT
// ==========================================

app.get(
    "/checkout",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const pool =
                await poolPromise;


            // ==================================
            // LẤY THÔNG TIN USER
            // ==================================

            const userResult =
                await pool
                    .request()

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            user_id,
                            full_name,
                            email,
                            phone

                        FROM users

                        WHERE user_id = @user_id
                    `);


            if (
                userResult.recordset.length === 0
            ) {

                return res.redirect("/login");

            }


            const customer =
                userResult.recordset[0];


            // ==================================
            // LẤY GIỎ HÀNG
            // ==================================

            const cartResult =
                await pool
                    .request()

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            ci.cart_item_id,
                            ci.quantity,

                            p.product_id,
                            p.product_name,
                            p.price,
                            p.image_url,
                            p.stock_quantity,

                            (
                                p.price *
                                ci.quantity
                            ) AS subtotal

                        FROM cart c

                        INNER JOIN cart_items ci
                            ON c.cart_id =
                               ci.cart_id

                        INNER JOIN products p
                            ON ci.product_id =
                               p.product_id

                        WHERE
                            c.user_id =
                            @user_id
                    `);


            const items =
                cartResult.recordset;


            // Không có sản phẩm
            if (items.length === 0) {

                return res.redirect("/cart");

            }


            // ==================================
            // TÍNH TỔNG
            // ==================================

            let total = 0;


            items.forEach(item => {

                total +=
                    Number(item.price) *
                    Number(item.quantity);

            });


            res.render(
                "checkout/index",
                {

                    customer: customer,

                    items: items,

                    total: total,

                    error: null

                }
            );


        }
        catch (error) {

            console.log(
                "Lỗi trang checkout:",
                error
            );

            res.status(500).send(
                "Không thể tải trang đặt hàng."
            );

        }

    }
);
// ==========================================
// XỬ LÝ ĐẶT HÀNG
// ==========================================

// ======================================================
// XỬ LÝ ĐẶT HÀNG - NỘI THẤT HOME
// ======================================================

app.post("/checkout", requireLogin, async (req, res) => {

    console.log("===== BẮT ĐẦU ĐẶT HÀNG =====");

    const userId = req.session.user.user_id;

    const {
        full_name,
        phone,
        shipping_address
    } = req.body;
    const receiver_name = full_name;

    console.log("User ID:", userId);
    console.log("Họ tên:", full_name);
    console.log("SĐT:", phone);
    console.log("Địa chỉ:", shipping_address);

    // ------------------------------------------
    // KIỂM TRA THÔNG TIN
    // ------------------------------------------

    if (!phone || !shipping_address) {

        return res.status(400).send(`
            <h2>Thiếu thông tin đặt hàng</h2>
            <p>Vui lòng nhập số điện thoại và địa chỉ.</p>
            <a href="/checkout">Quay lại</a>
        `);
    }


    let transaction = null;

    try {

        const pool = await poolPromise;

        console.log("1. Kết nối database thành công");


        // ==========================================
        // TẠO TRANSACTION
        // ==========================================

        transaction = new sql.Transaction(pool);

        await transaction.begin();

        console.log("2. Transaction bắt đầu");


        // ==========================================
        // LẤY GIỎ HÀNG
        // ==========================================

        const cartRequest =
            new sql.Request(transaction);

        cartRequest.input(
            "user_id",
            sql.Int,
            userId
        );

        const cartResult =
            await cartRequest.query(`
                SELECT
                    c.cart_id,
                    ci.cart_item_id,
                    ci.product_id,
                    ci.quantity,
                    p.product_name,
                    p.price,
                    p.stock_quantity

                FROM cart c

                INNER JOIN cart_items ci
                    ON c.cart_id = ci.cart_id

                INNER JOIN products p
                    ON ci.product_id = p.product_id

                WHERE c.user_id = @user_id
            `);


        const items = cartResult.recordset;

        console.log(
            "3. Số sản phẩm trong giỏ:",
            items.length
        );


        if (items.length === 0) {

            await transaction.rollback();

            transaction = null;

            return res.redirect("/cart");
        }


        // Lấy cart_id
        const cartId = items[0].cart_id;


        // ==========================================
        // KIỂM TRA TỒN KHO + TÍNH TỔNG
        // ==========================================

        let totalAmount = 0;


        for (const item of items) {

            if (
                Number(item.quantity) >
                Number(item.stock_quantity)
            ) {

                await transaction.rollback();

                transaction = null;

                return res.status(400).send(`
                    <h2>Không đủ hàng</h2>

                    <p>
                        Sản phẩm:
                        ${item.product_name}
                    </p>

                    <a href="/cart">
                        Quay lại giỏ hàng
                    </a>
                `);
            }


            totalAmount +=
                Number(item.price) *
                Number(item.quantity);
        }


        console.log(
            "4. Tổng tiền:",
            totalAmount
        );


        // ==========================================
        // TẠO ĐƠN HÀNG
        // ==========================================

        const orderRequest =
            new sql.Request(transaction);


        orderRequest.input(
            "user_id",
            sql.Int,
            userId
        );
        orderRequest.input(
            "receiver_name",
            sql.NVarChar(100),
            receiver_name
        );

        orderRequest.input(
            "total_amount",
            sql.Decimal(18, 2),
            totalAmount
        );

        orderRequest.input(
            "status",
            sql.NVarChar(50),
            "Chờ xác nhận"
        );

        orderRequest.input(
            "shipping_address",
            sql.NVarChar(500),
            shipping_address.trim()
        );

        orderRequest.input(
            "phone",
            sql.VarChar(20),
            phone.trim()
        );


        const orderResult =
    await orderRequest.query(`
        INSERT INTO orders
        (
            user_id,
            receiver_name,
            total_amount,
            status,
            shipping_address,
            phone,
            created_at
        )

        OUTPUT INSERTED.order_id

        VALUES
        (
            @user_id,
            @receiver_name,
            @total_amount,
            @status,
            @shipping_address,
            @phone,
            GETDATE()
        )
    `);


        const orderId =
            orderResult.recordset[0].order_id;


        console.log(
            "5. Đã tạo order:",
            orderId
        );


        // ==========================================
        // LƯU CHI TIẾT ĐƠN HÀNG
        // ==========================================

        for (const item of items) {

            const itemRequest =
                new sql.Request(transaction);


            itemRequest.input(
                "order_id",
                sql.Int,
                orderId
            );

            itemRequest.input(
                "product_id",
                sql.Int,
                item.product_id
            );

            itemRequest.input(
                "quantity",
                sql.Int,
                item.quantity
            );

            itemRequest.input(
                "unit_price",
                sql.Decimal(18, 2),
                Number(item.price)
            );


            await itemRequest.query(`
                INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    quantity,
                    unit_price
                )

                VALUES
                (
                    @order_id,
                    @product_id,
                    @quantity,
                    @unit_price
                )
            `);


            // ======================================
            // TRỪ TỒN KHO
            // ======================================

            const stockRequest =
                new sql.Request(transaction);


            stockRequest.input(
                "product_id",
                sql.Int,
                item.product_id
            );

            stockRequest.input(
                "quantity",
                sql.Int,
                item.quantity
            );


            const stockResult =
                await stockRequest.query(`
                    UPDATE products

                    SET stock_quantity =
                        stock_quantity - @quantity

                    WHERE
                        product_id = @product_id

                        AND stock_quantity >= @quantity
                `);


            if (
                stockResult.rowsAffected[0] === 0
            ) {

                throw new Error(
                    "Không đủ tồn kho: " +
                    item.product_name
                );
            }
        }


        console.log(
            "6. Đã lưu order_items và trừ kho"
        );


        // ==========================================
        // XÓA GIỎ HÀNG
        // ==========================================

        const deleteRequest =
            new sql.Request(transaction);


        deleteRequest.input(
            "cart_id",
            sql.Int,
            cartId
        );


        await deleteRequest.query(`
            DELETE FROM cart_items

            WHERE cart_id = @cart_id
        `);


        console.log(
            "7. Đã xóa sản phẩm khỏi giỏ"
        );


        // ==========================================
        // COMMIT
        // ==========================================

        await transaction.commit();

        transaction = null;


        console.log(
            "8. COMMIT THÀNH CÔNG"
        );

        console.log(
            "===== ĐẶT HÀNG THÀNH CÔNG ====="
        );


        // ==========================================
        // CHUYỂN SANG TRANG THÀNH CÔNG
        // ==========================================

        return res.redirect(
            "/checkout/success/" + orderId
        );

    }

    catch (error) {

        console.log("");
        console.log("==============================");
        console.log("LỖI ĐẶT HÀNG");
        console.log("==============================");

        console.error(error);

        console.log(
            "MESSAGE:",
            error.message
        );

        console.log("==============================");


        // ==========================================
        // ROLLBACK
        // ==========================================

        if (transaction) {

            try {

                await transaction.rollback();

                console.log(
                    "Đã rollback transaction"
                );

            }

            catch (rollbackError) {

                console.log(
                    "Rollback không cần thực hiện:",
                    rollbackError.message
                );
            }
        }


        // ==========================================
        // HIỆN LỖI THẬT
        // ==========================================

        return res.status(500).send(`
            <!DOCTYPE html>

            <html lang="vi">

            <head>

                <meta charset="UTF-8">

                <title>
                    Lỗi đặt hàng
                </title>

            </head>

            <body style="
                font-family: Arial;
                padding: 50px;
            ">

                <h1>
                    Không thể đặt hàng
                </h1>

                <h3>
                    Lỗi cụ thể:
                </h3>

                <p style="
                    padding: 20px;
                    background: #eeeeee;
                    color: #c00000;
                ">

                    ${error.message}

                </p>

                <p>
                    <a href="/cart">
                        ← Quay lại giỏ hàng
                    </a>
                </p>

            </body>

            </html>
        `);
    }
});
// ==========================================
// ĐẶT HÀNG THÀNH CÔNG
// ==========================================

app.get(
    "/checkout/success/:id",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const orderId =
                parseInt(req.params.id);


            if (isNaN(orderId)) {

                return res.redirect("/");

            }


            const pool =
                await poolPromise;


            const result =
                await pool
                    .request()

                    .input(
                        "order_id",
                        sql.Int,
                        orderId
                    )

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            order_id,
                            total_amount,
                            status,
                            shipping_address,
                            phone,
                            created_at

                        FROM orders

                        WHERE
                            order_id = @order_id
                            AND user_id = @user_id
                    `);


            if (
                result.recordset.length === 0
            ) {

                return res.status(404).send(
                    "Không tìm thấy đơn hàng."
                );

            }


            res.render(
                "checkout/success",
                {
                    order:
                        result.recordset[0]
                }
            );


        }
        catch (error) {

            console.log(
                "Lỗi trang thành công:",
                error
            );

            res.status(500).send(
                "Không thể tải thông tin đơn hàng."
            );

        }

    }
);
// ==========================================
// LỊCH SỬ ĐƠN HÀNG
// ==========================================

app.get(
    "/orders",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;


            const pool =
                await poolPromise;


            const result =
                await pool
                    .request()

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            order_id,
                            total_amount,
                            status,
                            shipping_address,
                            phone,
                            created_at

                        FROM orders

                        WHERE user_id = @user_id

                        ORDER BY
                            created_at DESC
                    `);


            res.render(
                "orders/index",
                {
                    orders:
                        result.recordset
                }
            );


        }
        catch (error) {

            console.log(
                "Lỗi lịch sử đơn hàng:",
                error
            );

            res.status(500).send(
                "Không thể tải lịch sử đơn hàng."
            );

        }

    }
);
// ==========================================
// CHI TIẾT ĐƠN HÀNG
// ==========================================

app.get(
    "/orders/:id",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                req.session.user.user_id;

            const orderId =
                parseInt(req.params.id);


            if (isNaN(orderId)) {

                return res.redirect("/orders");

            }


            const pool =
                await poolPromise;


            // LẤY ORDER

            const orderResult =
                await pool
                    .request()

                    .input(
                        "order_id",
                        sql.Int,
                        orderId
                    )

                    .input(
                        "user_id",
                        sql.Int,
                        userId
                    )

                    .query(`
                        SELECT
                            order_id,
                            total_amount,
                            status,
                            shipping_address,
                            phone,
                            created_at

                        FROM orders

                        WHERE
                            order_id = @order_id

                            AND user_id =
                                @user_id
                    `);


            if (
                orderResult.recordset.length === 0
            ) {

                return res.status(404).send(
                    "Không tìm thấy đơn hàng."
                );

            }


            // LẤY SẢN PHẨM

            const itemResult =
                await pool
                    .request()

                    .input(
                        "order_id",
                        sql.Int,
                        orderId
                    )

                    .query(`
                        SELECT
                            oi.order_item_id,
                            oi.product_id,
                            oi.quantity,
                            oi.unit_price,

                            p.product_name,
                            p.image_url,

                            (
                                oi.quantity *
                                oi.unit_price
                            ) AS subtotal

                        FROM order_items oi

                        INNER JOIN products p
                            ON oi.product_id =
                               p.product_id

                        WHERE
                            oi.order_id =
                            @order_id
                    `);


            res.render(
                "orders/detail",
                {

                    order:
                        orderResult.recordset[0],

                    items:
                        itemResult.recordset

                }
            );


        }
        catch (error) {

            console.log(
                "Lỗi chi tiết đơn:",
                error
            );

            res.status(500).send(
                "Không thể tải chi tiết đơn hàng."
            );

        }

    }
);
// ==========================================
// ADMIN - QUẢN LÝ ĐƠN HÀNG
// ==========================================

app.get(
    "/admin/orders",
    requireAdmin,
    async (req, res) => {

        try {

            const keyword =
                (req.query.keyword || "").trim();

            const status =
                (req.query.status || "").trim();

            const pool = await poolPromise;

            const request = pool.request();

            request.input(
                "keyword",
                sql.NVarChar(100),
                `%${keyword}%`
            );

            request.input(
                "status",
                sql.NVarChar(50),
                status
            );

            const result = await request.query(`
                SELECT
                    order_id,
                    user_id,
                    receiver_name,
                    phone,
                    shipping_address,
                    total_amount,
                    status,
                    created_at

                FROM orders

                WHERE
                (
                    @keyword = '%%'

                    OR receiver_name LIKE @keyword

                    OR phone LIKE @keyword

                    OR CAST(order_id AS NVARCHAR(20))
                       LIKE @keyword
                )

                AND
                (
                    @status = ''
                    OR status = @status
                )

                ORDER BY order_id DESC
            `);

            res.render(
                "admin/orders/index",
                {
                    orders: result.recordset,
                    keyword: keyword,
                    selectedStatus: status,
                    user: req.session.user
                }
            );

        } catch (error) {

            console.error(
                "LỖI QUẢN LÝ ĐƠN HÀNG:",
                error
            );

            res.status(500).send(`
                <h1>Lỗi quản lý đơn hàng</h1>

                <p>${error.message}</p>

                <a href="/admin">
                    Quay lại Admin
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - XEM CHI TIẾT ĐƠN HÀNG
// =====================================================

app.get("/admin/orders/:id", requireAdmin, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);

        if (isNaN(orderId)) {
            return res.status(400).send("Mã đơn hàng không hợp lệ");
        }

        const pool = await poolPromise;

        // ==========================================
        // 1. LẤY THÔNG TIN ĐƠN HÀNG
        // ==========================================

        const orderResult = await pool
            .request()
            .input("order_id", sql.Int, orderId)
            .query(`
                SELECT
                    order_id,
                    user_id,
                    receiver_name,
                    phone,
                    shipping_address,
                    total_amount,
                    status,
                    created_at
                FROM orders
                WHERE order_id = @order_id
            `);

        // Không tìm thấy đơn hàng
        if (orderResult.recordset.length === 0) {
            return res.status(404).send(`
                <h1>Không tìm thấy đơn hàng</h1>

                <p>
                    Đơn hàng #${orderId} không tồn tại.
                </p>

                <a href="/admin/orders">
                    Quay lại danh sách đơn hàng
                </a>
            `);
        }

        const order = orderResult.recordset[0];

        // ==========================================
        // 2. LẤY SẢN PHẨM TRONG ĐƠN
        // ==========================================

        const itemResult = await pool
            .request()
            .input("order_id", sql.Int, orderId)
            .query(`
                SELECT
                    oi.order_id,
                    oi.product_id,
                    oi.quantity,
                    oi.unit_price,
                    p.product_name
                FROM order_items oi

                INNER JOIN products p
                    ON oi.product_id = p.product_id

                WHERE oi.order_id = @order_id

                ORDER BY oi.product_id ASC
            `);

        // ==========================================
        // 3. HIỂN THỊ DETAIL.EJS
        // ==========================================

        res.render("admin/orders/detail", {
            order: order,
            items: itemResult.recordset,
            user: req.session.user
        });

    } catch (error) {

        console.error(
            "LỖI XEM CHI TIẾT ĐƠN HÀNG:",
            error
        );

        res.status(500).send(`
            <h1>Lỗi xem chi tiết đơn hàng</h1>

            <p>${error.message}</p>

            <a href="/admin/orders">
                Quay lại danh sách đơn hàng
            </a>
        `);
    }
});
// =====================================================
// ADMIN - CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
// =====================================================

app.post(
    "/admin/orders/:id/status",
    requireAdmin,
    async (req, res) => {

        try {

            const orderId = parseInt(req.params.id);

            const status = req.body.status;

            // ==========================================
            // KIỂM TRA ORDER ID
            // ==========================================

            if (isNaN(orderId)) {
                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");
            }

            // ==========================================
            // DANH SÁCH TRẠNG THÁI HỢP LỆ
            // ==========================================

            const allowedStatus = [
                "Chờ xác nhận",
                "Đã xác nhận",
                "Đang giao",
                "Hoàn thành",
                "Đã hủy"
            ];

            if (!allowedStatus.includes(status)) {

                return res
                    .status(400)
                    .send("Trạng thái đơn hàng không hợp lệ");

            }

            const pool = await poolPromise;

            // ==========================================
            // UPDATE DATABASE
            // ==========================================

            const result = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .input(
                    "status",
                    sql.NVarChar(50),
                    status
                )

                .query(`
                    UPDATE orders

                    SET status = @status

                    WHERE order_id = @order_id
                `);

            // ==========================================
            // KIỂM TRA ĐƠN HÀNG
            // ==========================================

            if (result.rowsAffected[0] === 0) {

                return res
                    .status(404)
                    .send("Không tìm thấy đơn hàng");

            }

            console.log(
                `Đã cập nhật đơn #${orderId} -> ${status}`
            );

            // ==========================================
            // QUAY LẠI CHI TIẾT ĐƠN
            // ==========================================

            res.redirect(
                `/admin/orders/${orderId}`
            );

        } catch (error) {

            console.error(
                "LỖI CẬP NHẬT TRẠNG THÁI:",
                error
            );

            res.status(500).send(`
                <h1>Không thể cập nhật trạng thái</h1>

                <p>${error.message}</p>

                <a href="/admin/orders">
                    Quay lại danh sách đơn
                </a>
            `);

        }

    }
);
// =====================================================
// KHÁCH HÀNG - DANH SÁCH ĐƠN HÀNG CỦA TÔI
// =====================================================

app.get(
    "/my-orders",
    requireLogin,
    async (req, res) => {

        try {

            const userId = req.session.user.user_id;

            const pool = await poolPromise;

            const result = await pool
                .request()

                .input(
                    "user_id",
                    sql.Int,
                    userId
                )

                .query(`
                    SELECT
                        order_id,
                        user_id,
                        receiver_name,
                        phone,
                        shipping_address,
                        total_amount,
                        status,
                        created_at

                    FROM orders

                    WHERE user_id = @user_id

                    ORDER BY order_id DESC
                `);

            res.render(
                "orders/index",
                {
                    orders: result.recordset,
                    user: req.session.user
                }
            );

        } catch (error) {

            console.error(
                "LỖI LẤY LỊCH SỬ ĐƠN HÀNG:",
                error
            );

            res.status(500).send(`
                <h1>Không thể tải đơn hàng</h1>

                <p>${error.message}</p>

                <a href="/">
                    Quay về NỘI THẤT HOME
                </a>
            `);

        }

    }
);
// =====================================================
// KHÁCH HÀNG - XEM CHI TIẾT ĐƠN HÀNG
// =====================================================

app.get(
    "/my-orders/:id",
    requireLogin,
    async (req, res) => {

        try {

            const orderId = parseInt(req.params.id);
            const userId = req.session.user.user_id;

            if (isNaN(orderId)) {

                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");

            }

            const pool = await poolPromise;

            // =========================================
            // LẤY ĐƠN HÀNG
            // Quan trọng: phải kiểm tra cả user_id
            // =========================================

            const orderResult = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .input(
                    "user_id",
                    sql.Int,
                    userId
                )

                .query(`
                    SELECT
                        order_id,
                        user_id,
                        receiver_name,
                        phone,
                        shipping_address,
                        total_amount,
                        status,
                        created_at

                    FROM orders

                    WHERE
                        order_id = @order_id
                        AND user_id = @user_id
                `);


            if (orderResult.recordset.length === 0) {

                return res.status(404).send(`
                    <h1>Không tìm thấy đơn hàng</h1>

                    <p>
                        Đơn hàng không tồn tại hoặc
                        không thuộc tài khoản của bạn.
                    </p>

                    <a href="/my-orders">
                        Quay lại đơn hàng của tôi
                    </a>
                `);

            }


            const order = orderResult.recordset[0];


            // =========================================
            // LẤY SẢN PHẨM CỦA ĐƠN
            // =========================================

            const itemResult = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .query(`
                    SELECT
                        oi.product_id,
                        oi.quantity,
                        oi.unit_price,
                        p.product_name

                    FROM order_items oi

                    INNER JOIN products p
                        ON oi.product_id = p.product_id

                    WHERE oi.order_id = @order_id

                    ORDER BY oi.product_id ASC
                `);


            res.render(
                "orders/detail",
                {
                    order: order,
                    items: itemResult.recordset,
                    user: req.session.user
                }
            );

        } catch (error) {

            console.error(
                "LỖI CHI TIẾT ĐƠN HÀNG:",
                error
            );

            res.status(500).send(`
                <h1>Không thể xem đơn hàng</h1>

                <p>${error.message}</p>

                <a href="/my-orders">
                    Quay lại
                </a>
            `);

        }

    }
);
// =====================================================
// KHÁCH HÀNG - HỦY ĐƠN + HOÀN LẠI TỒN KHO
// =====================================================

app.post(
    "/my-orders/:id/cancel",
    requireLogin,
    async (req, res) => {

        let transaction;

        try {

            const orderId = parseInt(req.params.id);
            const userId = req.session.user.user_id;

            if (isNaN(orderId)) {
                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");
            }


            const pool = await poolPromise;

            transaction = new sql.Transaction(pool);

            await transaction.begin();


            // ==========================================
            // 1. KIỂM TRA ĐƠN HÀNG
            // ==========================================

            const orderResult = await new sql.Request(transaction)
                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )
                .input(
                    "user_id",
                    sql.Int,
                    userId
                )
                .query(`
                    SELECT
                        order_id,
                        status
                    FROM orders
                    WHERE
                        order_id = @order_id
                        AND user_id = @user_id
                `);


            if (orderResult.recordset.length === 0) {

                await transaction.rollback();

                return res
                    .status(404)
                    .send("Không tìm thấy đơn hàng");
            }


            const order = orderResult.recordset[0];


            // ==========================================
            // 2. CHỈ CHO HỦY ĐƠN CHỜ XÁC NHẬN
            // ==========================================

            if (order.status !== "Chờ xác nhận") {

                await transaction.rollback();

                return res
                    .status(400)
                    .send(`
                        <h1>Không thể hủy đơn hàng</h1>

                        <p>
                            Chỉ có thể hủy đơn hàng
                            đang ở trạng thái Chờ xác nhận.
                        </p>

                        <a href="/my-orders/${orderId}">
                            Quay lại đơn hàng
                        </a>
                    `);
            }


            // ==========================================
            // 3. LẤY SẢN PHẨM TRONG ĐƠN
            // ==========================================

            const itemResult = await new sql.Request(transaction)
                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )
                .query(`
                    SELECT
                        product_id,
                        quantity
                    FROM order_items
                    WHERE order_id = @order_id
                `);


            // ==========================================
            // 4. HOÀN LẠI TỒN KHO
            // ==========================================

            for (const item of itemResult.recordset) {

                await new sql.Request(transaction)
                    .input(
                        "product_id",
                        sql.Int,
                        item.product_id
                    )
                    .input(
                        "quantity",
                        sql.Int,
                        item.quantity
                    )
                    .query(`
                        UPDATE products

                        SET stock_quantity =
                            stock_quantity + @quantity

                        WHERE product_id = @product_id
                    `);
            }


            // ==========================================
            // 5. ĐỔI TRẠNG THÁI ĐƠN
            // ==========================================

            await new sql.Request(transaction)
                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )
                .query(`
                    UPDATE orders

                    SET status = N'Đã hủy'

                    WHERE order_id = @order_id
                `);


            // ==========================================
            // 6. XÁC NHẬN TRANSACTION
            // ==========================================

            await transaction.commit();


            console.log(
                `Khách hàng đã hủy đơn #${orderId}`
            );


            res.redirect(
                `/my-orders/${orderId}`
            );


        } catch (error) {

            if (transaction) {

                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error(
                        "LỖI ROLLBACK:",
                        rollbackError
                    );
                }

            }


            console.error(
                "LỖI HỦY ĐƠN:",
                error
            );


            res.status(500).send(`
                <h1>Không thể hủy đơn hàng</h1>

                <p>${error.message}</p>

                <a href="/my-orders">
                    Quay lại đơn hàng
                </a>
            `);
        }
    }
);
app.get(
    "/admin",
    requireAdmin,
    async (req, res) => {

        try {

            const pool = await poolPromise;

            // =====================================
            // THỐNG KÊ ĐƠN HÀNG
            // =====================================

            const result = await pool
                .request()
                .query(`
                    SELECT

                        COUNT(*) AS total_orders,

                        SUM(
                            CASE
                                WHEN status = N'Chờ xác nhận'
                                THEN 1
                                ELSE 0
                            END
                        ) AS pending_orders,

                        SUM(
                            CASE
                                WHEN status = N'Đã xác nhận'
                                THEN 1
                                ELSE 0
                            END
                        ) AS confirmed_orders,

                        SUM(
                            CASE
                                WHEN status = N'Đang giao'
                                THEN 1
                                ELSE 0
                            END
                        ) AS shipping_orders,

                        SUM(
                            CASE
                                WHEN status = N'Hoàn thành'
                                THEN 1
                                ELSE 0
                            END
                        ) AS completed_orders,

                        SUM(
                            CASE
                                WHEN status = N'Đã hủy'
                                THEN 1
                                ELSE 0
                            END
                        ) AS cancelled_orders,

                        ISNULL(
                            SUM(
                                CASE
                                    WHEN status = N'Hoàn thành'
                                    THEN total_amount
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS revenue

                    FROM orders
                `);

            const stats = result.recordset[0];

            res.render(
                "admin/index",
                {
                    user: req.session.user,
                    stats: stats
                }
            );

        } catch (error) {

            console.error(
                "LỖI DASHBOARD ADMIN:",
                error
            );

            res.status(500).send(`
                <h1>Không thể tải Dashboard</h1>

                <p>${error.message}</p>

                <a href="/">
                    Quay về trang chủ
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - QUẢN LÝ KHÁCH HÀNG
// =====================================================

app.get(
    "/admin/users",
    requireAdmin,
    async (req, res) => {

        try {

            const pool = await poolPromise;

            const result = await pool
                .request()
                .query(`
                    SELECT
                        user_id,
                        full_name,
                        email,
                        role

                    FROM users

                    ORDER BY user_id DESC
                `);

            res.render(
                "admin/users/index",
                {
                    users: result.recordset,
                    user: req.session.user
                }
            );

        } catch (error) {

            console.error(
                "LỖI QUẢN LÝ KHÁCH HÀNG:",
                error
            );

            res.status(500).send(`
                <h1>Không thể tải khách hàng</h1>

                <p>${error.message}</p>

                <a href="/admin">
                    Quay lại Admin
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - DANH SÁCH SẢN PHẨM
// =====================================================

app.get(
    "/admin/products",
    requireAdmin,
    async (req, res) => {

        try {

            const pool = await poolPromise;

            const result = await pool
    .request()
    .query(`
        SELECT
            product_id,
            product_name,
            price,
            stock_quantity
        FROM products
        ORDER BY product_id DESC
    `);

            res.render(
                "admin/products/index",
                {
                    products: result.recordset,
                    user: req.session.user
                }
            );

        } catch (error) {

            console.error(
                "LỖI QUẢN LÝ SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể tải sản phẩm</h1>

                <p>${error.message}</p>

                <a href="/admin">
                    Quay lại Dashboard
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - FORM THÊM SẢN PHẨM
// =====================================================

app.get(
    "/admin/products/create",
    requireAdmin,
    (req, res) => {

        res.render(
            "admin/products/create",
            {
                user: req.session.user
            }
        );

    }
);
// =====================================================
// ADMIN - THÊM SẢN PHẨM
// =====================================================

app.post(
    "/admin/products/create",
    requireAdmin,
    upload.single("image"),
    async (req, res) => {

        try {

            const productName =
                (req.body.product_name || "").trim();

            const price =
                Number(req.body.price);

            const stockQuantity =
                Number(req.body.stock_quantity);

            const description =
                (req.body.description || "").trim();

            const categoryId = 
                parseInt(req.body.category_id); 

            const image = req.file
               ? req.file.filename
               : null;
            // =====================================
            // KIỂM TRA DỮ LIỆU
            // =====================================

            if (!productName) {

                return res
                    .status(400)
                    .send("Tên sản phẩm không được để trống");

            }


            if (
                isNaN(price) ||
                price < 0
            ) {

                return res
                    .status(400)
                    .send("Giá sản phẩm không hợp lệ");

            }


            if (
                isNaN(stockQuantity) ||
                stockQuantity < 0
            ) {

                return res
                    .status(400)
                    .send("Số lượng tồn kho không hợp lệ");

            }


            const pool = await poolPromise;


            await pool
                .request()

                .input(
                    "product_name",
                    sql.NVarChar(255),
                    productName
                )

                .input(
                    "price",
                    sql.Decimal(18, 2),
                    price
                )

                .input(
                    "stock_quantity",
                    sql.Int,
                    stockQuantity
                )

                .input(
                    "description",
                    sql.NVarChar(sql.MAX),
                    description || null
                )

               .input(
                   "category_id",
                    sql.Int,
                    categoryId
                )

                .input(
                    "image",
                    sql.NVarChar(255),
                    image
                )

                .query(`
    INSERT INTO products
    (
        product_name,
        category_id,
        price,
        stock_quantity,
        description,
        image,
        is_active
    )

    VALUES
    (
        @product_name,
        @category_id,
        @price,
        @stock_quantity,
        @description,
        @image,
        1
    )
`);


            console.log(
                "Đã thêm sản phẩm:",
                productName
            );


            res.redirect(
                "/admin/products"
            );

        } catch (error) {

            console.error(
                "LỖI THÊM SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể thêm sản phẩm</h1>

                <p>${error.message}</p>

                <a href="/admin/products/create">
                    Quay lại
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - FORM SỬA SẢN PHẨM
// =====================================================

app.get(
    "/admin/products/:id/edit",
    requireAdmin,
    async (req, res) => {

        try {

            const productId =
                parseInt(req.params.id);

            if (isNaN(productId)) {

                return res
                    .status(400)
                    .send("Mã sản phẩm không hợp lệ");

            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "product_id",
                    sql.Int,
                    productId
                )

                .query(`
    SELECT
        p.product_id,
        p.product_name,
        p.price,
        p.stock_quantity,
        p.image_url,
        p.is_active
    FROM products p
    ORDER BY p.product_id DESC
`);


            if (result.recordset.length === 0) {

                return res
                    .status(404)
                    .send("Không tìm thấy sản phẩm");

            }


            res.render(
                "admin/products/edit",
                {
                    product: result.recordset[0],
                    user: req.session.user
                }
            );


        } catch (error) {

            console.error(
                "LỖI MỞ TRANG SỬA SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể mở sản phẩm</h1>

                <p>${error.message}</p>

                <a href="/admin/products">
                    Quay lại
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - CẬP NHẬT SẢN PHẨM
// =====================================================

app.post(
    "/admin/products/:id/edit",
    requireAdmin,
    async (req, res) => {

        try {

            const productId =
                parseInt(req.params.id);

            const productName =
                (req.body.product_name || "").trim();

            const price =
                Number(req.body.price);

            const stockQuantity =
                Number(req.body.stock_quantity);

            const description =
                (req.body.description || "").trim();


            if (isNaN(productId)) {

                return res
                    .status(400)
                    .send("Mã sản phẩm không hợp lệ");

            }


            if (!productName) {

                return res
                    .status(400)
                    .send("Tên sản phẩm không được để trống");

            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "product_id",
                    sql.Int,
                    productId
                )

                .input(
                    "product_name",
                    sql.NVarChar(255),
                    productName
                )

                .input(
                    "price",
                    sql.Decimal(18, 2),
                    price
                )

                .input(
                    "stock_quantity",
                    sql.Int,
                    stockQuantity
                )

                .input(
                    "description",
                    sql.NVarChar(sql.MAX),
                    description || null
                )

                .query(`
    UPDATE products

    SET
        product_name = @product_name,
        price = @price,
        stock_quantity = @stock_quantity,
        description = @description

    WHERE product_id = @product_id
`);


            if (result.rowsAffected[0] === 0) {

                return res
                    .status(404)
                    .send("Không tìm thấy sản phẩm");

            }


            res.redirect(
                "/admin/products"
            );


        } catch (error) {

            console.error(
                "LỖI SỬA SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể sửa sản phẩm</h1>

                <p>${error.message}</p>

                <a href="/admin/products">
                    Quay lại
                </a>
            `);

        }

    }
);
// =====================================================
// ADMIN - XÓA / NGỪNG KINH DOANH SẢN PHẨM
// =====================================================

app.post(
    "/admin/products/:id/delete",
    requireAdmin,
    async (req, res) => {

        try {

            const productId = parseInt(req.params.id);

            if (isNaN(productId)) {
                return res
                    .status(400)
                    .send("Mã sản phẩm không hợp lệ");
            }

            const pool = await poolPromise;


            // ==========================================
            // 1. KIỂM TRA SẢN PHẨM CÓ TRONG ĐƠN HÀNG
            // ==========================================

            const checkOrder = await pool
                .request()
                .input(
                    "product_id",
                    sql.Int,
                    productId
                )
                .query(`
                    SELECT COUNT(*) AS total
                    FROM order_items
                    WHERE product_id = @product_id
                `);


            const usedInOrder =
                checkOrder.recordset[0].total > 0;


            // ==========================================
            // 2. ĐÃ CÓ ĐƠN → NGỪNG KINH DOANH
            // ==========================================

            if (usedInOrder) {

                await pool
                    .request()
                    .input(
                        "product_id",
                        sql.Int,
                        productId
                    )
                    .query(`
                        UPDATE products

                        SET is_active = 0

                        WHERE product_id = @product_id
                    `);

                return res.redirect(
                    "/admin/products"
                );
            }


            // ==========================================
            // 3. CHƯA CÓ ĐƠN → XÓA SẢN PHẨM
            // ==========================================

            await pool
                .request()
                .input(
                    "product_id",
                    sql.Int,
                    productId
                )
                .query(`
                    DELETE FROM products

                    WHERE product_id = @product_id
                `);


            res.redirect(
                "/admin/products"
            );


        } catch (error) {

            console.error(
                "LỖI XÓA SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể xử lý sản phẩm</h1>

                <p>${error.message}</p>

                <a href="/admin/products">
                    Quay lại quản lý sản phẩm
                </a>
            `);
        }
    }
);
// =====================================================
// ADMIN - XÁC NHẬN ĐƠN HÀNG
// =====================================================

app.post(
    "/admin/orders/:id/confirm",
    requireAdmin,
    async (req, res) => {

        try {

            const orderId = parseInt(req.params.id);

            if (isNaN(orderId)) {
                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");
            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .query(`
                    UPDATE orders

                    SET status = N'Đã xác nhận'

                    WHERE
                        order_id = @order_id
                        AND status = N'Chờ xác nhận'
                `);


            if (result.rowsAffected[0] === 0) {

                return res
                    .status(400)
                    .send(`
                        <h1>Không thể xác nhận đơn</h1>

                        <p>
                            Đơn hàng không tồn tại
                            hoặc không còn ở trạng thái
                            Chờ xác nhận.
                        </p>

                        <a href="/admin/orders">
                            Quay lại
                        </a>
                    `);
            }


            res.redirect(
                `/admin/orders/${orderId}`
            );


        } catch (error) {

            console.error(
                "LỖI XÁC NHẬN ĐƠN:",
                error
            );

            res.status(500).send(`
                <h1>Không thể xác nhận đơn hàng</h1>
                <p>${error.message}</p>
                <a href="/admin/orders">Quay lại</a>
            `);
        }
    }
);
// =====================================================
// ADMIN - BẮT ĐẦU GIAO HÀNG
// =====================================================

app.post(
    "/admin/orders/:id/shipping",
    requireAdmin,
    async (req, res) => {

        try {

            const orderId = parseInt(req.params.id);

            if (isNaN(orderId)) {
                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");
            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .query(`
                    UPDATE orders

                    SET status = N'Đang giao'

                    WHERE
                        order_id = @order_id
                        AND status = N'Đã xác nhận'
                `);


            if (result.rowsAffected[0] === 0) {

                return res
                    .status(400)
                    .send(
                        "Không thể chuyển đơn sang Đang giao"
                    );
            }


            res.redirect(
                `/admin/orders/${orderId}`
            );


        } catch (error) {

            console.error(
                "LỖI CHUYỂN ĐANG GIAO:",
                error
            );

            res.status(500).send(`
                <h1>Không thể cập nhật đơn hàng</h1>
                <p>${error.message}</p>
                <a href="/admin/orders">Quay lại</a>
            `);
        }
    }
);
// =====================================================
// ADMIN - HOÀN THÀNH ĐƠN HÀNG
// =====================================================

app.post(
    "/admin/orders/:id/complete",
    requireAdmin,
    async (req, res) => {

        try {

            const orderId = parseInt(req.params.id);

            if (isNaN(orderId)) {
                return res
                    .status(400)
                    .send("Mã đơn hàng không hợp lệ");
            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "order_id",
                    sql.Int,
                    orderId
                )

                .query(`
                    UPDATE orders

                    SET status = N'Hoàn thành'

                    WHERE
                        order_id = @order_id
                        AND status = N'Đang giao'
                `);


            if (result.rowsAffected[0] === 0) {

                return res
                    .status(400)
                    .send(
                        "Không thể hoàn thành đơn hàng"
                    );
            }


            res.redirect(
                `/admin/orders/${orderId}`
            );


        } catch (error) {

            console.error(
                "LỖI HOÀN THÀNH ĐƠN:",
                error
            );

            res.status(500).send(`
                <h1>Không thể hoàn thành đơn hàng</h1>
                <p>${error.message}</p>
                <a href="/admin/orders">Quay lại</a>
            `);
        }
    }
);
// =====================================================
// ADMIN - BÁN LẠI SẢN PHẨM
// =====================================================

app.post(
    "/admin/products/:id/restore",
    requireAdmin,
    async (req, res) => {

        try {

            const productId = parseInt(req.params.id);

            if (isNaN(productId)) {
                return res
                    .status(400)
                    .send("Mã sản phẩm không hợp lệ");
            }


            const pool = await poolPromise;


            const result = await pool
                .request()

                .input(
                    "product_id",
                    sql.Int,
                    productId
                )

                .query(`
                    UPDATE products

                    SET is_active = 1

                    WHERE product_id = @product_id
                `);


            if (result.rowsAffected[0] === 0) {

                return res
                    .status(404)
                    .send("Không tìm thấy sản phẩm");
            }


            res.redirect(
                "/admin/products"
            );


        } catch (error) {

            console.error(
                "LỖI BÁN LẠI SẢN PHẨM:",
                error
            );

            res.status(500).send(`
                <h1>Không thể bán lại sản phẩm</h1>
                <p>${error.message}</p>
                <a href="/admin/products">Quay lại</a>
            `);
        }
    }
);
app.listen(PORT, () => {

    console.log(
        `NỘI THẤT HOME đang chạy tại http://localhost:${PORT}`
    );

});
function requireLogin(
    req,
    res,
    next
) {

    if (!req.session.user) {

        return res.redirect(
            "/login"
        );

    }

    next();

}


function requireAdmin(
    req,
    res,
    next
) {

    if (!req.session.user) {

        return res.redirect(
            "/login"
        );

    }


    if (
        req.session.user.role
        !== "admin"
    ) {

        return res.status(403).send(`
            <h1>403 - Không có quyền truy cập</h1>

            <p>
                Chức năng này chỉ dành
                cho Quản trị viên.
            </p>

            <a href="/">
                Quay về NỘI THẤT HOME
            </a>
        `);

    }


    next();

}


module.exports = {

    requireLogin,

    requireAdmin

};
