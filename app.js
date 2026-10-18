
const express = require("express");
const { sql, poolPromise } = require("./db");
const bcrypt = require("bcryptjs");
const session = require("express-session");
require("dotenv").config();

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).send(
            "Bạn không có quyền truy cập trang quản trị."
        );
    }

    next();
}

// Đưa thông tin đăng nhập tới các trang EJS
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});


// Trang chủ
app.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(
      "SELECT TOP 8 * FROM products ORDER BY product_id DESC"
    );

    res.render("index", {
      products: result.recordset,
    user: req.session.user || null
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Lỗi tải sản phẩm từ SQL Server");
  }
});



app.get("/products", async (req, res) => {
    try {
        const pool = await poolPromise;

        // 1. Lấy thông tin tìm kiếm và lọc
        const q = (req.query.q || "").trim();
        const category = req.query.category || "";
        const sort = req.query.sort || "newest";

        const min = Number(req.query.min) || 0;
        const max = Number(req.query.max) || 999999999;

        // 2. Phân trang: 8 sản phẩm mỗi trang
        const pageSize = 8;
        const requestedPage = Number(req.query.page);
        const page = Number.isSafeInteger(requestedPage)
            ? Math.max(1, requestedPage)
            : 1;

        // 3. Điều kiện tìm kiếm
        const whereClause = `
            FROM products p
            LEFT JOIN categories c
                ON p.category_id = c.category_id
            WHERE p.product_name LIKE @q
              AND (
                    @category = ''
                    OR c.category_name = @category
                  )
              AND p.price BETWEEN @min AND @max
        `;

        // 4. Đếm tổng sản phẩm phù hợp
        const countResult = await pool.request()
            .input("q", `%${q}%`)
            .input("category", category)
            .input("min", min)
            .input("max", max)
            .query(`
                SELECT COUNT(*) AS total
                ${whereClause}
            `);

        const totalProducts = countResult.recordset[0].total;
        const totalPages = Math.max(
            1,
            Math.ceil(totalProducts / pageSize)
        );

        // Tránh truy cập trang vượt quá số trang
        const currentPage = Math.min(page, totalPages);
        const offset = (currentPage - 1) * pageSize;

        // 5. Lấy 8 sản phẩm của trang hiện tại
        const sortOptions = {
    newest: "p.product_id DESC",
    price_asc: "p.price ASC, p.product_id DESC",
    price_desc: "p.price DESC, p.product_id DESC"
};

const orderBy = sortOptions[sort] || sortOptions.newest;
        const result = await pool.request()
            .input("q", `%${q}%`)
            .input("category", category)
            .input("min", min)
            .input("max", max)
            .input("offset", offset)
            .input("pageSize", pageSize)
            .query(`
    SELECT p.*, c.category_name
    ${whereClause}
    ORDER BY ${orderBy}
    OFFSET @offset ROWS
    FETCH NEXT @pageSize ROWS ONLY
`);

        // 6. Truyền dữ liệu sang EJS
        const categoryResult = await pool.request().query(`
    SELECT category_id, category_name
    FROM categories
    ORDER BY category_name
`);
       res.render("products", {
    products: result.recordset,
    categories: categoryResult.recordset,

    q,
    category,
    sort,

    min: req.query.min || "",
    max: req.query.max || "",

    currentPage,
    totalPages,
    totalProducts
});

    } catch (err) {
        console.error("Lỗi phân trang sản phẩm:", err);
        res.status(500).send(
            "Không thể tải danh sách sản phẩm."
        );
    }
});



// Chi tiết sản phẩm
app.get("/products/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(404).send("Sản phẩm không tồn tại");
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("id", id)
      .query(`
        SELECT p.*, c.category_name
        FROM products p
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        WHERE p.product_id = @id
      `);

    const product = result.recordset[0];

    if (!product) {
      return res.status(404).send("Không tìm thấy sản phẩm");
    }

const reviewsResult = await pool.request()
    .input("productId", Number(req.params.id))
    .query(`
        SELECT
            r.review_id,
            r.rating,
            r.comment,
            r.created_at,
            u.full_name
        FROM product_reviews r
INNER JOIN users u
    ON r.user_id = u.user_id
WHERE r.product_id = @productId
  AND r.is_approved = 1
ORDER BY r.created_at DESC, r.review_id DESC
    `);

const reviews = reviewsResult.recordset;

    res.render("detail", {
    product: product,
    reviews: reviews
});

  } catch (err) {
    console.error(err);
    res.status(500).send("Lỗi tải chi tiết sản phẩm");
  }
});

app.get("/register", (req, res) => {
    res.render("register", {
        error: null
    });
});

app.post("/register", async (req, res) => {
    try {
        const fullName = (req.body.full_name || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();
        const password = req.body.password || "";
        const phone = (req.body.phone || "").trim();

        if (!fullName || !email || !password) {
            return res.status(400).render("register", {
                error: "Vui lòng nhập đầy đủ thông tin bắt buộc."
            });
        }

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            email.length > 254
        ) {
            return res.status(400).render("register", {
                error: "Email không hợp lệ."
            });
        }

        if (password.length < 8 || password.length > 72) {
            return res.status(400).render("register", {
                error: "Mật khẩu phải có từ 8 đến 72 ký tự."
            });
        }

        const pool = await poolPromise;

        const existing = await pool.request()
            .input("email", email)
            .query(`
                SELECT user_id
                FROM users
                WHERE email = @email
            `);

        if (existing.recordset.length > 0) {
            return res.status(409).render("register", {
                error: "Email đã được sử dụng."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await pool.request()
            .input("fullName", fullName)
            .input("email", email)
            .input("passwordHash", passwordHash)
            .input("phone", phone || null)
            .query(`
                INSERT INTO users
                    (full_name, email, password_hash, phone)
                VALUES
                    (@fullName, @email, @passwordHash, @phone)
            `);

        res.redirect("/login?registered=1");

    } catch (error) {
        console.error("Lỗi đăng ký:", error);
        res.status(500).render("register", {
            error: "Không thể đăng ký. Vui lòng thử lại."
        });
    }
});

app.get("/login", (req, res) => {
    res.render("login", {
        error: null,
        registered: req.query.registered === "1"
    });
});

app.post("/login", async (req, res) => {
    try {
        const email = (req.body.email || "").trim().toLowerCase();
        const password = req.body.password || "";

        const pool = await poolPromise;

        const result = await pool.request()
            .input("email", email)
            .query(`
                SELECT
                    user_id,
                    full_name,
                    email,
                    password_hash,
                    role,
                    is_active
                FROM users
                WHERE email = @email
            `);

        
const user = result.recordset[0];


if (user && !user.is_active) {
    return res.status(403).send(
        "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên."
    );
}

if (!user) {
    return res.status(401).send(
        "Email hoặc mật khẩu không chính xác"
    );
}

if (typeof user.password_hash !== "string") {
    console.error("Không tìm thấy password_hash");
    return res.status(500).send(
        "Lỗi dữ liệu mật khẩu trong SQL Server"
    );
}

const isMatch = await bcrypt.compare(
    password,
    user.password_hash
);

if (!isMatch) {
    return res.status(401).send(
        "Email hoặc mật khẩu không chính xác"
    );
}


        if (
            !user ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            return res.status(401).render("login", {
                error: "Email hoặc mật khẩu không chính xác.",
                registered: false
            });
        }

        // Tạo phiên mới để tránh session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Lỗi phiên đăng nhập");
            }

            req.session.user = {
                id: user.user_id,
                name: user.full_name,
                email: user.email,
                role: user.role
            };

            req.session.save((err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Không thể lưu phiên");
                }

                res.redirect("/account");
            });
        });

    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        res.status(500).render("login", {
            error: "Không thể đăng nhập.",
            registered: false
        });
    }
});

// Middleware yêu cầu đăng nhập
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    next();
}

// Trang thông tin tài khoản
app.get("/account", requireLogin, (req, res) => {
    res.render("account", {
        user: req.session.user
    });
});

// Đăng xuất
app.post("/logout", requireLogin, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Không thể đăng xuất");
        }

        res.clearCookie("connect.sid");
        res.redirect("/login");
    });
});

app.get("/login", (req, res) => {
    res.render("login", {
        error: null,
        registered: req.query.registered === "1"
    });
});

app.get("/register", (req, res) => {
    res.render("register", {
        error: null
    });
});

// ===== BƯỚC 11: TRANG THANH TOÁN =====

app.get("/checkout", requireLogin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session.user.id;

        const result = await pool.request()
            .input("userId", userId)
            .query(`
                SELECT
                    ci.product_id,
                    ci.quantity,
                    p.product_name,
                    p.price,
                    p.image_url
                FROM cart c
                INNER JOIN cart_items ci
                    ON c.cart_id = ci.cart_id
                INNER JOIN products p
                    ON ci.product_id = p.product_id
                WHERE c.user_id = @userId
            `);

        const items = result.recordset;

        if (items.length === 0) {
            return res.redirect("/cart");
        }

        const total = items.reduce(
            (sum, item) =>
                sum + Number(item.price) * item.quantity,
            0
        );

        res.render("checkout", {
            items,
            total,
            user: req.session.user,
            error: null
        });

    } catch (error) {
        console.error("Lỗi trang thanh toán:", error);
        res.status(500).send(
            "Không thể tải trang thanh toán"
        );
    }
});

// ===== XỬ LÝ ĐẶT HÀNG COD =====
// Giả định cấu trúc bảng đúng như mục 11.1.

app.post("/checkout", requireLogin, async (req, res) => {
    const fullName = String(req.body.full_name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const address = String(req.body.address || "").trim();
    const paymentMethod = req.body.payment_method;

    if (
        !fullName ||
        fullName.length > 100 ||
        !/^[0-9+\s().-]{9,20}$/.test(phone) ||
        !address ||
        address.length > 500 ||
        paymentMethod !== "COD"
    ) {
        return res.status(400).send(
            "Thông tin đặt hàng không hợp lệ."
        );
    }

    let transaction;
    let started = false;

    try {
        const pool = await poolPromise;
        const userId = req.session.user.id;

        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;

        // Khóa giỏ hàng trong lúc tạo đơn
        const cartResult = await new sql.Request(transaction)
            .input("userId", sql.Int, userId)
            .query(`
                SELECT cart_id
                FROM cart WITH (UPDLOCK, HOLDLOCK)
                WHERE user_id = @userId
            `);

        if (cartResult.recordset.length !== 1) {
            throw new Error("Không tìm thấy giỏ hàng hợp lệ.");
        }

        const cartId = cartResult.recordset[0].cart_id;

        // Lấy sản phẩm và khóa dữ liệu tồn kho
        const result = await new sql.Request(transaction)
            .input("cartId", sql.Int, cartId)
            .query(`
                SELECT
                    ci.product_id,
                    ci.quantity,
                    p.product_name,
                    p.price,
                    p.stock
                FROM cart_items ci WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN products p WITH (UPDLOCK, HOLDLOCK)
                    ON ci.product_id = p.product_id
                WHERE ci.cart_id = @cartId
                ORDER BY ci.product_id
            `);

        const items = result.recordset;

        if (items.length === 0) {
            throw new Error("Giỏ hàng đang trống.");
        }

        let total = 0;

        for (const item of items) {
            if (
                !Number.isSafeInteger(item.quantity) ||
                item.quantity <= 0 ||
                item.quantity > item.stock
            ) {
                throw new Error(
                    `Sản phẩm ${item.product_name} không đủ hàng.`
                );
            }

            total += Number(item.price) * item.quantity;
        }

        // Tạo đơn hàng
        const orderResult = await new sql.Request(transaction)
            .input("userId", sql.Int, userId)
            .input("fullName", sql.NVarChar(100), fullName)
            .input("phone", sql.VarChar(20), phone)
            .input("address", sql.NVarChar(500), address)
            .input("total", sql.Decimal(18, 2), total)
            .input("paymentMethod", sql.VarChar(20), "COD")
            
.query(`
    INSERT INTO orders (
        user_id,
        receiver_name,
        phone,
        address,
        total_amount,
        status,
        payment_method,
        payment_status,
        created_at
    )
    OUTPUT INSERTED.order_id
    VALUES (
        @userId,
        @fullName,
        @phone,
        @address,
        @total,
        N'Chờ xác nhận',
        @paymentMethod,
        N'Chưa thanh toán',
        GETDATE()
    )
`);


        const orderId = orderResult.recordset[0].order_id;

        // Lưu chi tiết và trừ tồn kho
        for (const item of items) {
            await new sql.Request(transaction)
                .input("orderId", sql.Int, orderId)
                .input("productId", sql.Int, item.product_id)
                .input("quantity", sql.Int, item.quantity)
                .input("price", sql.Decimal(18, 2), item.price)
                
.query(`
    INSERT INTO order_items (
        order_id,
        product_id,
        quantity,
        unit_price
    )
    VALUES (
        @orderId,
        @productId,
        @quantity,
        @price
    )
`);


            const stockResult = await new sql.Request(transaction)
                .input("productId", sql.Int, item.product_id)
                .input("quantity", sql.Int, item.quantity)
                .query(`
                    UPDATE products
                    SET stock = stock - @quantity
                    WHERE product_id = @productId
                      AND stock >= @quantity
                `);

            if (stockResult.rowsAffected[0] !== 1) {
                throw new Error(
                    `Không đủ tồn kho: ${item.product_name}`
                );
            }
        }

        // Xóa giỏ hàng sau khi tạo đơn thành công
        await new sql.Request(transaction)
            .input("cartId", sql.Int, cartId)
            .query(`
                DELETE FROM cart_items
                WHERE cart_id = @cartId
            `);

        await transaction.commit();
        started = false;

        res.redirect(`/orders/${orderId}`);

    } catch (error) {
        if (started && transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error(
                    "Lỗi rollback:",
                    rollbackError.message
                );
            }
        }

        console.error("Lỗi đặt hàng:", error);
        res.status(400).send(
            "Đặt hàng chưa thành công: " + error.message
        );
    }
});

// Danh sách đơn hàng của khách hàng
app.get("/orders", requireLogin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session.user.id;

        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query(`
                SELECT
                    order_id,
                    total_amount,
                    status,
                    payment_status,
                    created_at
                FROM orders
                WHERE user_id = @userId
                ORDER BY created_at DESC, order_id DESC
            `);

        res.render("orders", {
            orders: result.recordset
        });

    } catch (error) {
        console.error("Lỗi xem đơn hàng:", error);
        res.status(500).send(
            "Không thể tải lịch sử đơn hàng"
        );
    }
});

app.get("/orders/:id", requireLogin, async (req, res) => {
    try {
        const orderId = Number(req.params.id);

        if (!Number.isSafeInteger(orderId) || orderId <= 0) {
            return res.status(400).send("Mã đơn không hợp lệ");
        }

        const pool = await poolPromise;

        const orderResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .input("userId", sql.Int, req.session.user.id)
            .query(`
                SELECT *
                FROM orders
                WHERE order_id = @orderId
                  AND user_id = @userId
            `);

        if (orderResult.recordset.length === 0) {
            return res.status(404).send(
                "Không tìm thấy đơn hàng"
            );
        }

        const itemsResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT
                    oi.quantity,
                    oi.unit_price AS price,
                    p.product_name,
                    p.image_url
                FROM order_items oi
                INNER JOIN products p
                    ON oi.product_id = p.product_id
                WHERE oi.order_id = @orderId
            `);

        res.render("order-detail", {
            order: orderResult.recordset[0],
            items: itemsResult.recordset
        });

    } catch (error) {
        console.error("Lỗi chi tiết đơn:", error);
        res.status(500).send(
            "Không thể tải chi tiết đơn hàng"
        );
    }
});

app.get("/orders/:id", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const orderId = Number(req.params.id);
        const userId = req.session.user.id;

        if (!Number.isSafeInteger(orderId) || orderId <= 0) {
            return res.status(400).send("Mã đơn hàng không hợp lệ");
        }

        const pool = await poolPromise;

        const orderResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .input("userId", sql.Int, userId)
            .query(`
                SELECT *
                FROM orders
                WHERE order_id = @orderId
                  AND user_id = @userId
            `);

        if (orderResult.recordset.length === 0) {
            return res.status(404).send("Không tìm thấy đơn hàng");
        }

        const itemsResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT
                    oi.product_id,
                    oi.quantity,
                    oi.unit_price,
                    p.product_name,
                    p.image_url
                FROM order_items oi
                LEFT JOIN products p
                    ON oi.product_id = p.product_id
                WHERE oi.order_id = @orderId
            `);

        res.render("order-detail", {
            order: orderResult.recordset[0],
            items: itemsResult.recordset
        });

    } catch (err) {
        console.error("Lỗi chi tiết đơn hàng:", err);
        res.status(500).send("Không thể tải chi tiết đơn hàng");
    }
});

app.post("/orders/:id/request-cancel", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const orderId = Number(req.params.id);
        const userId = req.session.user.id;

        if (!Number.isSafeInteger(orderId) || orderId <= 0) {
            return res.status(400).send("Mã đơn hàng không hợp lệ");
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("orderId", sql.Int, orderId)
            .input("userId", sql.Int, userId)
            .query(`
                UPDATE orders
                SET status = 'cancel_requested'
                WHERE order_id = @orderId
                  AND user_id = @userId
                  AND status IN (N'Chờ xác nhận', N'Đã xác nhận')
                  AND payment_status = N'Chưa thanh toán'
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(400).send(
                "Không thể yêu cầu hủy đơn này. " +
                "Đơn có thể đã xử lý, đã thanh toán " +
                "hoặc không thuộc tài khoản của bạn."
            );
        }

        res.redirect("/orders/" + orderId);

    } catch (err) {
        console.error("Lỗi yêu cầu hủy đơn:", err);
        res.status(500).send("Không thể gửi yêu cầu hủy đơn");
    }
});

app.get("/admin", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;

        const products = await pool.request()
            .query("SELECT COUNT(*) AS total FROM products");

        const customers = await pool.request()
            .query(`
                SELECT COUNT(*) AS total
                FROM users
                WHERE role = N'customer'
            `);

        const orders = await pool.request()
            .query("SELECT COUNT(*) AS total FROM orders");

        const pending = await pool.request()
            .query(`
                SELECT COUNT(*) AS total
                FROM orders
                WHERE status = N'Chờ xác nhận'
            `);

        res.render("admin", {
            totalProducts: products.recordset[0].total,
            totalCustomers: customers.recordset[0].total,
            totalOrders: orders.recordset[0].total,
            pendingOrders: pending.recordset[0].total,
            admin: req.session.user
        });

    } catch (error) {
        console.error("Lỗi Admin:", error);
        res.status(500).send(
            "Không thể tải trang quản trị."
        );
    }
});

app.get("/admin/products", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT
                    product_id,
                    product_name,
                    price,
                    stock,
                    image_url
                FROM products
                ORDER BY product_id DESC
            `);

        res.render("admin-products", {
            products: result.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(
            "Không thể tải danh sách sản phẩm."
        );
    }
});

app.get("/admin/customers", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT
                    user_id,
                    full_name,
                    email,
                    phone,
                    role,
                    is_active
                FROM users
                ORDER BY user_id DESC
            `);

        res.render("admin-customers", {
            customers: result.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(
            "Không thể tải danh sách khách hàng."
        );
    }
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT
                    order_id,
                    receiver_name,
                    phone,
                    address,
                    total_amount,
                    status,
                    payment_method,
                    payment_status,
                    created_at
                FROM orders
                ORDER BY order_id DESC
            `);

        res.render("admin-orders", {
            orders: result.recordset
        });

    } catch (error) {
        console.error(error);
        res.status(500).send(
            "Không thể tải danh sách đơn hàng."
        );
    }
});

app.get("/admin/products/add", requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .query(`
                SELECT category_id, category_name
                FROM categories
                ORDER BY category_name
            `);

        res.render("admin-product-form", {
            product: null,
            categories: result.recordset
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Không thể mở form thêm sản phẩm");
    }
});

app.post("/admin/products/add", requireAdmin, async (req, res) => {
    try {
        const name = String(req.body.product_name || "").trim();
        const price = Number(req.body.price);
        const stock = Number(req.body.stock);
        const categoryId = Number(req.body.category_id);
        const imageUrl = String(req.body.image_url || "").trim();
        const description = String(req.body.description || "").trim();

        if (!name || !Number.isFinite(price) || price < 0 ||
            !Number.isSafeInteger(stock) || stock < 0 ||
            !Number.isSafeInteger(categoryId) || categoryId <= 0) {
            return res.status(400).send("Thông tin sản phẩm không hợp lệ");
        }

        const pool = await poolPromise;

        const category = await pool.request()
            .input("categoryId", sql.Int, categoryId)
            .query(`
                SELECT category_id
                FROM categories
                WHERE category_id = @categoryId
            `);

        if (!category.recordset.length) {
            return res.status(400).send("Danh mục không tồn tại");
        }

        await pool.request()
            .input("name", sql.NVarChar(200), name)
            .input("price", sql.Decimal(18, 2), price)
            .input("stock", sql.Int, stock)
            .input("categoryId", sql.Int, categoryId)
            .input("imageUrl", sql.NVarChar(500), imageUrl)
            .input("description", sql.NVarChar(sql.MAX), description)
            .query(`
                INSERT INTO products
                    (product_name, price, stock,
                     category_id, image_url, description)
                VALUES
                    (@name, @price, @stock,
                     @categoryId, @imageUrl, @description)
            `);

        res.redirect("/admin/products");
    } catch (err) {
        console.error("Lỗi thêm sản phẩm:", err);
        res.status(500).send("Không thể thêm sản phẩm");
    }
});

app.get("/admin/products/:id/edit", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).send("Mã sản phẩm không hợp lệ");
        }

        const pool = await poolPromise;

        const productResult = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT *
                FROM products
                WHERE product_id = @id
            `);

        if (!productResult.recordset.length) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        const categoryResult = await pool.request()
            .query(`
                SELECT category_id, category_name
                FROM categories
                ORDER BY category_name
            `);

        res.render("admin-product-form", {
            product: productResult.recordset[0],
            categories: categoryResult.recordset
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Không thể mở trang sửa sản phẩm");
    }
});

app.post("/admin/products/:id/edit", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body.product_name || "").trim();
        const price = Number(req.body.price);
        const stock = Number(req.body.stock);
        const categoryId = Number(req.body.category_id);
        const imageUrl = String(req.body.image_url || "").trim();
        const description = String(req.body.description || "").trim();

        if (!Number.isSafeInteger(id) || id <= 0 ||
            !name || !Number.isFinite(price) || price < 0 ||
            !Number.isSafeInteger(stock) || stock < 0 ||
            !Number.isSafeInteger(categoryId) || categoryId <= 0) {
            return res.status(400).send("Thông tin không hợp lệ");
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("id", sql.Int, id)
            .input("name", sql.NVarChar(200), name)
            .input("price", sql.Decimal(18, 2), price)
            .input("stock", sql.Int, stock)
            .input("categoryId", sql.Int, categoryId)
            .input("imageUrl", sql.NVarChar(500), imageUrl)
            .input("description", sql.NVarChar(sql.MAX), description)
            .query(`
                UPDATE products
                SET product_name = @name,
                    price = @price,
                    stock = @stock,
                    category_id = @categoryId,
                    image_url = @imageUrl,
                    description = @description
                WHERE product_id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        res.redirect("/admin/products");
    } catch (err) {
        console.error(err);
        res.status(500).send("Không thể sửa sản phẩm");
    }
});

app.post("/admin/customers/:id/toggle", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).send("Mã khách hàng không hợp lệ");
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                UPDATE users
                SET is_active =
                    CASE WHEN is_active = 1 THEN 0 ELSE 1 END
                WHERE user_id = @id
                  AND role = N'customer'
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send(
                "Không tìm thấy khách hàng hợp lệ"
            );
        }

        res.redirect("/admin/customers");
    } catch (err) {
        console.error(err);
        res.status(500).send("Không thể cập nhật khách hàng");
    }
});

app.post("/admin/orders/:id/status", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const newStatus = String(req.body.status || "");

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).send("Mã đơn hàng không hợp lệ");
        }

        const transitions = {
            "Chờ xác nhận": ["Đã xác nhận", "Đã hủy"],
            "Đã xác nhận": ["Đang giao hàng", "Đã hủy"],
            "Đang giao hàng": ["Đã giao hàng"],
            "Đã giao hàng": [],
            "Đã hủy": []
        };

        if (!Object.values(transitions).flat().includes(newStatus)) {
            return res.status(400).send("Trạng thái không hợp lệ");
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT status
                FROM orders
                WHERE order_id = @id
            `);

        if (!result.recordset.length) {
            return res.status(404).send("Không tìm thấy đơn hàng");
        }

        const oldStatus = result.recordset[0].status;

        if (!transitions[oldStatus] ||
            !transitions[oldStatus].includes(newStatus)) {
            return res.status(400).send(
                "Không thể chuyển từ trạng thái hiện tại sang trạng thái này"
            );
        }

        const update = await pool.request()
            .input("id", sql.Int, id)
            .input("oldStatus", sql.NVarChar(50), oldStatus)
            .input("newStatus", sql.NVarChar(50), newStatus)
            .query(`
                UPDATE orders
                SET status = @newStatus
                WHERE order_id = @id
                  AND status = @oldStatus
            `);

        if (update.rowsAffected[0] === 0) {
            return res.status(409).send(
                "Đơn hàng vừa được cập nhật. Hãy tải lại trang."
            );
        }

        res.redirect("/admin/orders");
    } catch (err) {
        console.error("Lỗi cập nhật đơn hàng:", err);
        res.status(500).send("Không thể cập nhật đơn hàng");
    }
});

app.post("/admin/orders/:id/status", requireAdmin, async (req, res) => {
    const orderId = Number(req.params.id);
    const newStatus = String(req.body.status || "").trim();

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).send("Mã đơn hàng không hợp lệ");
    }

    const transitions = {
        "Chờ xác nhận": ["Đã xác nhận", "Đã hủy"],
        "Đã xác nhận": ["Đang giao hàng", "Đã hủy"],
        "Đang giao hàng": ["Đã giao hàng"],
        "Đã giao hàng": [],
        "Đã hủy": []
    };

    if (!Object.values(transitions).flat().includes(newStatus)) {
        return res.status(400).send("Trạng thái yêu cầu không hợp lệ");
    }

    let transaction;

    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        // Khóa đơn hàng để tránh cập nhật đồng thời.
        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT order_id, status, payment_status,
                       stock_restored
                FROM orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).send("Không tìm thấy đơn hàng");
        }

        const order = orderResult.recordset[0];
        const allowed = transitions[order.status] || [];

        if (!allowed.includes(newStatus)) {
            await transaction.rollback();
            return res.status(400).send(
                "Không thể chuyển từ trạng thái hiện tại sang trạng thái này"
            );
        }

        // Khi hủy đơn: hoàn lại số lượng sản phẩm.
        if (newStatus === "Đã hủy") {
            if (order.stock_restored) {
                await transaction.rollback();
                return res.status(409).send(
                    "Đơn hàng này đã được hoàn kho trước đó"
                );
            }

            const itemsResult = await new sql.Request(transaction)
                .input("orderId", sql.Int, orderId)
                .query(`
                    SELECT product_id, SUM(quantity) AS quantity
                    FROM order_items
                    WHERE order_id = @orderId
                    GROUP BY product_id
                `);

            if (itemsResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(400).send(
                    "Đơn hàng không có chi tiết sản phẩm"
                );
            }

            for (const item of itemsResult.recordset) {
                const quantity = Number(item.quantity);

                if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                    throw new Error("Số lượng sản phẩm không hợp lệ");
                }

                const updateStock = await new sql.Request(transaction)
                    .input("productId", sql.Int, item.product_id)
                    .input("quantity", sql.Int, quantity)
                    .query(`
                        UPDATE products
                        SET stock = stock + @quantity
                        WHERE product_id = @productId
                    `);

                if (updateStock.rowsAffected[0] !== 1) {
                    throw new Error(
                        "Không tìm thấy sản phẩm để hoàn kho: " +
                        item.product_id
                    );
                }
            }

            // Đánh dấu đã hoàn kho và hủy đơn.
            await new sql.Request(transaction)
                .input("orderId", sql.Int, orderId)
                .query(`
                    UPDATE orders
                    SET status = N'Đã hủy',
                        stock_restored = 1
                    WHERE order_id = @orderId
                `);
        } else {
            await new sql.Request(transaction)
                .input("orderId", sql.Int, orderId)
                .input("newStatus", sql.NVarChar(50), newStatus)
                .query(`
                    UPDATE orders
                    SET status = @newStatus
                    WHERE order_id = @orderId
                `);
        }

        await transaction.commit();
        transaction = null;

        res.redirect("/admin/orders");

    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error("Lỗi rollback:", rollbackErr);
            }
        }

        console.error("Lỗi cập nhật đơn hàng:", err);
        res.status(500).send("Không thể cập nhật đơn hàng");
    }
});

app.post("/admin/orders/:id/payment", requireAdmin, async (req, res) => {
    const orderId = Number(req.params.id);
    const newPaymentStatus = String(
        req.body.payment_status || ""
    ).trim();

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).send("Mã đơn hàng không hợp lệ");
    }

    let transaction;

    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const result = await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT status, payment_status
                FROM orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        if (!result.recordset.length) {
            await transaction.rollback();
            return res.status(404).send("Không tìm thấy đơn hàng");
        }

        const order = result.recordset[0];

        // Chỉ xác nhận đã thanh toán cho đơn chưa bị hủy.
        const canMarkPaid =
            newPaymentStatus === "Đã thanh toán" &&
            order.payment_status === "Chưa thanh toán" &&
            order.status !== "Đã hủy";

        // Chỉ ghi nhận đã hoàn tiền cho đơn đã hủy,
        // trước đó đã được ghi nhận thanh toán.
        const canMarkRefunded =
            newPaymentStatus === "Đã hoàn tiền" &&
            order.payment_status === "Đã thanh toán" &&
            order.status === "Đã hủy";

        if (!canMarkPaid && !canMarkRefunded) {
            await transaction.rollback();
            return res.status(400).send(
                "Không thể cập nhật trạng thái thanh toán này"
            );
        }

        await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .input(
                "paymentStatus",
                sql.NVarChar(30),
                newPaymentStatus
            )
            .query(`
                UPDATE orders
                SET payment_status = @paymentStatus
                WHERE order_id = @orderId
            `);

        await transaction.commit();
        transaction = null;

        res.redirect("/admin/orders");

    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error("Lỗi rollback:", rollbackErr);
            }
        }

        console.error("Lỗi thanh toán:", err);
        res.status(500).send(
            "Không thể cập nhật trạng thái thanh toán"
        );
    }
});

app.post("/admin/orders/:id/approve-cancel", async (req, res) => {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.status(403).send("Bạn không có quyền truy cập");
    }

    const orderId = Number(req.params.id);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).send("Mã đơn hàng không hợp lệ");
    }

    let transaction;

    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);

        await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

        const orderResult = await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT order_id, status, payment_status
                FROM orders WITH (UPDLOCK, HOLDLOCK)
                WHERE order_id = @orderId
            `);

        const order = orderResult.recordset[0];

        if (!order || order.status !== "cancel_requested") {
            await transaction.rollback();
            return res.status(400).send(
                "Đơn hàng không còn ở trạng thái chờ duyệt hủy"
            );
        }

        // Đơn đã thanh toán cần quy trình hoàn tiền riêng.
        if (order.payment_status !== "unpaid") {
            await transaction.rollback();
            return res.status(400).send(
                "Đơn đã thanh toán, cần xử lý hoàn tiền trước khi hủy"
            );
        }

        // Kiểm tra chi tiết đơn hàng.
        const itemsResult = await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT product_id, quantity
                FROM order_items
                WHERE order_id = @orderId
            `);

        const items = itemsResult.recordset;

        if (items.length === 0) {
            await transaction.rollback();
            return res.status(400).send(
                "Không có sản phẩm trong đơn hàng"
            );
        }

        // Hoàn lại số lượng từng sản phẩm.
        for (const item of items) {
            const result = await new sql.Request(transaction)
                .input("productId", sql.Int, item.product_id)
                .input("quantity", sql.Int, item.quantity)
                .query(`
                    UPDATE products
                    SET stock = stock + @quantity
                    WHERE product_id = @productId
                `);

            if (result.rowsAffected[0] !== 1) {
                throw new Error(
                    "Không tìm thấy sản phẩm " + item.product_id
                );
            }
        }

        // Cập nhật trạng thái đơn.
        await new sql.Request(transaction)
            .input("orderId", sql.Int, orderId)
            .query(`
                UPDATE orders
                SET status = 'cancelled'
                WHERE order_id = @orderId
                  AND status = 'cancel_requested'
            `);

        await transaction.commit();

        return res.redirect("/admin/orders");

    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Lỗi rollback:", rollbackError);
            }
        }

        console.error("Lỗi duyệt hủy đơn:", err);
        return res.status(500).send(
            "Không thể duyệt hủy đơn hàng"
        );
    }
});

app.post("/admin/orders/:id/reject-cancel", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "admin") {
            return res.status(403).send("Bạn không có quyền truy cập");
        }

        const orderId = Number(req.params.id);

        if (!Number.isSafeInteger(orderId) || orderId <= 0) {
            return res.status(400).send("Mã đơn hàng không hợp lệ");
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                UPDATE orders
                SET status = 'pending'
                WHERE order_id = @orderId
                  AND status = 'cancel_requested'
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(400).send(
                "Không tìm thấy yêu cầu hủy đang chờ xử lý"
            );
        }

        return res.redirect("/admin/orders");

    } catch (err) {
        console.error("Lỗi từ chối hủy:", err);
        return res.status(500).send(
            "Không thể từ chối yêu cầu hủy"
        );
    }
});

app.get("/admin/dashboard", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "admin") {
            return res.redirect("/login");
        }

        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM products) AS totalProducts,

                (SELECT COUNT(*) FROM users
                 WHERE role = 'customer') AS totalCustomers,

                (SELECT COUNT(*) FROM orders) AS totalOrders,

                (SELECT ISNULL(SUM(total_amount), 0)
                 FROM orders
                 WHERE status = N'Đã giao hàng'
                   AND payment_status = N'Đã thanh toán'
                ) AS totalRevenue,

                (SELECT COUNT(*) FROM orders
                 WHERE status = N'Chờ xác nhận'
                ) AS pendingOrders,

                (SELECT COUNT(*) FROM orders
                 WHERE status = N'Đang giao hàng'
                ) AS shippingOrders,

                (SELECT COUNT(*) FROM orders
                 WHERE status = N'Đã hủy'
                ) AS cancelledOrders
        `);

        const recentResult = await pool.request().query(`
            SELECT TOP 5
                order_id,
                receiver_name,
                total_amount,
                status,
                payment_status,
                created_at
            FROM orders
            ORDER BY created_at DESC
        `);
        
const monthlyResult = await pool.request().query(`
    SELECT
        MONTH(created_at) AS month,
        SUM(total_amount) AS revenue
    FROM orders
    WHERE YEAR(created_at) = YEAR(GETDATE())
      AND status = N'Đã giao hàng'
      AND payment_status = N'Đã thanh toán'
    GROUP BY MONTH(created_at)
    ORDER BY month
`);

const bestSellingResult = await pool.request().query(`
    SELECT TOP 5
        p.product_id,
        p.product_name,
        p.image_url,
        SUM(oi.quantity) AS total_sold
    FROM order_items oi
    INNER JOIN orders o
        ON oi.order_id = o.order_id
    INNER JOIN products p
        ON oi.product_id = p.product_id
    WHERE o.status = N'Đã giao hàng'
    GROUP BY
        p.product_id,
        p.product_name,
        p.image_url
    ORDER BY total_sold DESC
`);

const monthlyRevenue = Array.from(
    { length: 12 },
    (_, index) => {
        const month = index + 1;

        const item = monthlyResult.recordset.find(
            row => Number(row.month) === month
        );

        return {
            month: month,
            revenue: item ? Number(item.revenue) : 0
        };
    }
);

        
res.render("admin-dashboard", {
    stats: result.recordset[0],
    recentOrders: recentResult.recordset,
    monthlyRevenue: monthlyRevenue,
    bestSellingProducts: bestSellingResult.recordset,
    user: req.session.user
});


    } catch (err) {
        console.error("Lỗi Dashboard:", err);
        res.status(500).send("Không thể tải thống kê Admin.");
    }
});

/* =====================================
   BƯỚC 19: KHÁCH HÀNG ĐÁNH GIÁ SẢN PHẨM
===================================== */

app.post("/products/:id/review", async (req, res) => {
    try {
        // Kiểm tra đăng nhập
        if (!req.session.user) {
            return res.redirect("/login");
        }

        const productId = Number(req.params.id);
        const userId = req.session.user.id;
        const rating = Number(req.body.rating);
        const comment = (req.body.comment || "").trim();

        // Kiểm tra dữ liệu
        if (
            !Number.isSafeInteger(productId) ||
            productId <= 0 ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5 ||
            comment.length < 5 ||
            comment.length > 1000
        ) {
            return res.status(400).send(
                "Thông tin đánh giá không hợp lệ."
            );
        }

        const pool = await poolPromise;

        // Kiểm tra sản phẩm tồn tại
        const productResult = await pool.request()
            .input("productId", productId)
            .query(`
                SELECT product_id
                FROM products
                WHERE product_id = @productId
            `);

        if (productResult.recordset.length === 0) {
            return res.status(404).send(
                "Không tìm thấy sản phẩm."
            );
        }

        // Lưu đánh giá
        await pool.request()
            .input("productId", productId)
            .input("userId", userId)
            .input("rating", rating)
            .input("comment", comment)
            .query(`
                INSERT INTO product_reviews
                    (product_id, user_id, rating, comment)
                VALUES
                    (@productId, @userId, @rating, @comment)
            `);

        res.redirect("/products/" + productId);

    } catch (err) {
        console.error("Lỗi gửi đánh giá:", err);
        res.status(500).send(
            "Không thể gửi đánh giá sản phẩm."
        );
    }
});

/* ==========================================
   BƯỚC 20: KIỂM TRA QUYỀN ADMIN
========================================== */

function requireReviewAdmin(req, res, next) {

    if (!req.session || !req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).send(
            "Bạn không có quyền truy cập trang này."
        );
    }

    next();
}


/* ==========================================
   ADMIN: XEM DANH SÁCH ĐÁNH GIÁ
========================================== */

app.get(
    "/admin/reviews",
    requireReviewAdmin,
    async (req, res) => {

    try {
        const pool = await poolPromise;

        const status = req.query.status || "all";

        let sqlQuery = `
            SELECT
                r.review_id,
                r.rating,
                r.comment,
                r.created_at,
                r.is_approved,
                p.product_name,
                u.full_name
            FROM product_reviews r
            INNER JOIN products p
                ON r.product_id = p.product_id
            INNER JOIN users u
                ON r.user_id = u.user_id
        `;

        if (status === "pending") {
            sqlQuery += " WHERE r.is_approved = 0";
        }

        if (status === "approved") {
            sqlQuery += " WHERE r.is_approved = 1";
        }

        sqlQuery += `
            ORDER BY
                r.created_at DESC,
                r.review_id DESC
        `;

        const result = await pool.request()
            .query(sqlQuery);

        res.render("admin-reviews", {
            reviews: result.recordset
        });

    } catch (err) {

        console.error("Lỗi tải đánh giá:", err);

        res.status(500).send(
            "Không thể tải danh sách đánh giá."
        );
    }
});

/* ==========================================
   ADMIN: DUYỆT ĐÁNH GIÁ
========================================== */

app.post(
    "/admin/reviews/:id/approve",
    requireReviewAdmin,
    async (req, res) => {

    try {

        const reviewId = Number(req.params.id);

        if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
            return res.status(400).send(
                "Mã đánh giá không hợp lệ."
            );
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("reviewId", reviewId)
            .query(`
                UPDATE product_reviews
                SET is_approved = 1
                WHERE review_id = @reviewId
                  AND is_approved = 0
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send(
                "Đánh giá không tồn tại hoặc đã được duyệt."
            );
        }

        res.redirect("/admin/reviews");

    } catch (err) {

        console.error("Lỗi duyệt đánh giá:", err);

        res.status(500).send(
            "Không thể duyệt đánh giá."
        );
    }
});

/* ==========================================
   ADMIN: XÓA ĐÁNH GIÁ
========================================== */

app.post(
    "/admin/reviews/:id/delete",
    requireReviewAdmin,
    async (req, res) => {

    try {

        const reviewId = Number(req.params.id);

        if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
            return res.status(400).send(
                "Mã đánh giá không hợp lệ."
            );
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("reviewId", reviewId)
            .query(`
                DELETE FROM product_reviews
                WHERE review_id = @reviewId
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send(
                "Không tìm thấy đánh giá cần xóa."
            );
        }

        res.redirect("/admin/reviews");

    } catch (err) {

        console.error("Lỗi xóa đánh giá:", err);

        res.status(500).send(
            "Không thể xóa đánh giá."
        );
    }
});

const PORT = process.env.PORT || 3000;

app.get("/test", (req, res) => {
    res.send("KET NOI EXPRESS THANH CONG!");
});

app.listen(PORT, () => {
  console.log(`Website chạy tại http://localhost:${PORT}`);
});



// Chỉ sử dụng cho giai đoạn thử nghiệm.
// Sau này thay bằng user_id từ phiên đăng nhập.
function getTestUserId() {
    const id = Number(process.env.TEST_USER_ID);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("TEST_USER_ID không hợp lệ");
    }

    return id;
}

// Lấy hoặc tạo giỏ hàng của tài khoản thử nghiệm
async function getOrCreateCart(pool, userId) {
    const existing = await pool.request()
        .input("userId", userId)
        .query(`
            SELECT TOP 1 cart_id
            FROM cart
            WHERE user_id = @userId
            ORDER BY cart_id
        `);

    if (existing.recordset.length > 0) {
        return existing.recordset[0].cart_id;
    }

    const result = await pool.request()
        .input("userId", userId)
        .query(`
            INSERT INTO cart (user_id)
            OUTPUT INSERTED.cart_id
            VALUES (@userId)
        `);

    return result.recordset[0].cart_id;
}

// 1. Hiển thị giỏ hàng
app.get("/cart", requireLogin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session.user.id; 
        const cartId = await getOrCreateCart(pool, userId);

        const result = await pool.request()
            .input("cartId", cartId)
            .query(`
                SELECT
                    ci.cart_item_id,
                    ci.product_id,
                    ci.quantity,
                    p.product_name,
                    p.price,
                    p.image_url,
                    p.stock
                FROM cart_items ci
                INNER JOIN products p
                    ON ci.product_id = p.product_id
                WHERE ci.cart_id = @cartId
                ORDER BY ci.cart_item_id DESC
            `);

        const items = result.recordset;

        const total = items.reduce(
            (sum, item) =>
                sum + Number(item.price) * item.quantity,
            0
        );

        res.render("cart", { items, total });

    } catch (error) {
        console.error("Lỗi giỏ hàng:", error);
        res.status(500).send("Không thể tải giỏ hàng");
    }
});

// 2. Thêm sản phẩm vào giỏ
app.post("/cart/add", requireLogin, async (req, res) => {
    try {
        const productId = Number(req.body.product_id);
        const quantity = Number(req.body.quantity);

        if (
            !Number.isSafeInteger(productId) ||
            productId <= 0 ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).send("Dữ liệu không hợp lệ");
        }

        const pool = await poolPromise;
        const userId = req.session.user.id;
        const cartId = await getOrCreateCart(pool, userId);

        const productResult = await pool.request()
            .input("productId", productId)
            .query(`
                SELECT stock
                FROM products
                WHERE product_id = @productId
            `);

        if (productResult.recordset.length === 0) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        const stock = productResult.recordset[0].stock;

        const existing = await pool.request()
            .input("cartId", cartId)
            .input("productId", productId)
            .query(`
                SELECT quantity
                FROM cart_items
                WHERE cart_id = @cartId
                  AND product_id = @productId
            `);

        const oldQuantity = existing.recordset.length
            ? existing.recordset[0].quantity
            : 0;

        if (quantity + oldQuantity > stock) {
            return res.status(400).send(
                "Số lượng vượt quá hàng tồn kho"
            );
        }

        if (existing.recordset.length > 0) {
            await pool.request()
                .input("cartId", cartId)
                .input("productId", productId)
                .input("quantity", quantity)
                .query(`
                    UPDATE cart_items
                    SET quantity = quantity + @quantity
                    WHERE cart_id = @cartId
                      AND product_id = @productId
                `);
        } else {
            await pool.request()
                .input("cartId", cartId)
                .input("productId", productId)
                .input("quantity", quantity)
                .query(`
                    INSERT INTO cart_items
                        (cart_id, product_id, quantity)
                    VALUES
                        (@cartId, @productId, @quantity)
                `);
        }

        res.redirect("/cart");

    } catch (error) {
        console.error("Lỗi thêm giỏ hàng:", error);
        res.status(500).send("Không thể thêm sản phẩm");
    }
});

// 3. Cập nhật số lượng
app.post("/cart/update", requireLogin, async (req, res) => {
    try {
        const itemId = Number(req.body.cart_item_id);
        const quantity = Number(req.body.quantity);

        if (
            !Number.isSafeInteger(itemId) ||
            itemId <= 0 ||
            !Number.isSafeInteger(quantity) ||
            quantity <= 0
        ) {
            return res.status(400).send("Số lượng không hợp lệ");
        }

        const pool = await poolPromise;
        const userId = req.session.user.id;
        const cartId = await getOrCreateCart(pool, userId);

        const result = await pool.request()
            .input("itemId", itemId)
            .input("cartId", cartId)
            .query(`
                SELECT p.stock
                FROM cart_items ci
                INNER JOIN products p
                    ON ci.product_id = p.product_id
                WHERE ci.cart_item_id = @itemId
                  AND ci.cart_id = @cartId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).send("Không tìm thấy sản phẩm");
        }

        if (quantity > result.recordset[0].stock) {
            return res.status(400).send(
                "Số lượng vượt quá hàng tồn kho"
            );
        }

        await pool.request()
            .input("itemId", itemId)
            .input("cartId", cartId)
            .input("quantity", quantity)
            .query(`
                UPDATE cart_items
                SET quantity = @quantity
                WHERE cart_item_id = @itemId
                  AND cart_id = @cartId
            `);

        res.redirect("/cart");

    } catch (error) {
        console.error(error);
        res.status(500).send("Không thể cập nhật giỏ hàng");
    }
});

// 4. Xóa sản phẩm khỏi giỏ
app.post("/cart/delete", requireLogin, async (req, res) => {
    try {
        const itemId = Number(req.body.cart_item_id);

        if (!Number.isSafeInteger(itemId) || itemId <= 0) {
            return res.status(400).send("Sản phẩm không hợp lệ");
        }

        const pool = await poolPromise;
        const userId = req.session.user.id;
        const cartId = await getOrCreateCart(pool, userId);

        await pool.request()
            .input("itemId", itemId)
            .input("cartId", cartId)
            .query(`
                DELETE FROM cart_items
                WHERE cart_item_id = @itemId
                  AND cart_id = @cartId
            `);

        res.redirect("/cart");

    } catch (error) {
        console.error(error);
        res.status(500).send("Không thể xóa sản phẩm");
    }
});
