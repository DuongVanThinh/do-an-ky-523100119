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