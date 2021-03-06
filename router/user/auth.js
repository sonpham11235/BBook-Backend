const express = require('express');
const router = express.Router();

require('dotenv').config();
const { signinValidation } = require('../../validation');

const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const async = require('async');
const crypto = require('crypto');

const User = require('../../models/user');

router.post('/email', (req, res, next) => {
    // validate user input
    const { error } = signinValidation(req.body);
    if (error) return res.status(400).json({
        success: false,
        err: error
    });

    User.findOne({email: req.body.email})
        .then((user) => {
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "No user with that email"
                });
            }

            user.comparePassword(req.body.password, (err, matched) => {
                if (!matched) {
					return res.status(401).json({
						success: false,
						message: 'Sai mật khẩu!',
					});
                }

                if (!user.activated) {
                    return res.status(401).json({
						success: false,
						message: 'Tài khoản chưa được kích hoạt',
					});
                }
                
                let token = jwt.sign({ userID: user._id },
                    process.env.TOKEN_SECRET,
                    { expiresIn: '24h' }
                );

                return res.status(200).json({
                        success: true,
                        user: removeSensitiveData(user),
                        message: "Đăng nhập thành công",
                        token: token
                    });
            });
        }).catch(next);
});

router.post('/auth-provider', (req, res, next) => {
    const provider = req.body.provider;
    const uid = req.body.uid;

    User.findOne({provider: provider, providerUID: uid})
        .then((user) => {
            if (!user) {
                let newUser = new User({
                    providerUID: uid,
                    provider: provider,
                    books: [],
                    tradedBooks: [],
                    transactions: [],
                    tradeRequests: [],
                    name: req.body.name,
                    email: req.body.email
                });

                newUser.save()
                    .then((newUser) => {
                        let token = jwt.sign({ userID: newUser._id },
                            process.env.TOKEN_SECRET,
                            { expiresIn: '24h' }
                        );
        
                        return res.status(200).json({
                                success: true,
                                user: removeSensitiveData(newUser),
                                message: "Đăng nhập thành công",
                                token: token
                            });
                });
            } else {
                let token = jwt.sign({ userID: user._id },
                    process.env.TOKEN_SECRET,
                    { expiresIn: '24h' }
                );
    
                return res.status(200).json({
                        success: true,
                        user: removeSensitiveData(user),
                        message: "Đăng nhập thành công",
                        token: token,
                    });
            }
        }).catch(next);
})

router.post('/forgot', (req, res, next) => {
    async.waterfall([
        (done) => {
            crypto.randomBytes(20, function(err, buf) {
                let token = buf.toString('hex');
                done(err, token);
            });
        },
        (token, done) => {
            User.findOne({email: req.body.email})
                .then((user) => {
                    if (!user) {
                        res.status(404).json({
                            success: false,
                            message: "Không tìm thấy người dùng với email này"
                        })
                        return res.redirect('/forgot');
                    }
            
                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
            
                    user.save(function(err) {
                      done(err, token, user);
                    });
                });
        },
        (token, user, done) => {
            let smtpTransport = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'bbookteam@gmail.com',
                    pass: 'bbook1998'
                }
            });
            let mailOptions = {
                to: user.email,
                from: 'bbookteam@gmail.com',
                subject: 'Node.js Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'https://1653015.github.io/BBook-Frontend/#/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function(err) {
                res.status(200).json({
                    success: true,
                    message: "Email khôi phục mật khẩu đã được gửi đến địa chỉ email của bạn"
                })
                done(err, 'done');
            });
        }
    ], (err) => {
        if (err) return next(err);
        res.redirect('/forgot');
    });
});

router.post('/reset/:token', (req, res, next) => {
    User.findOne({ resetPasswordToken: req.params.token })
        .then((user) => {
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Không tìm thấy user này"
                })
            }
            
            user.password = req.body.password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            user.save((err) => {
                if (!err) {
                    return res.status(200).json({
                        success: true,
                        message: "Khôi phục password thành công"
                    });
                } else {
                    return res.status(400).json({
                        success: false,
                        err: err
                    });
                }
            });
        }).catch(next);
});

router.post('/signout', (req, res, next) => {
    res.clearCookie('token');
    next();
});

const removeSensitiveData = (user) => {
	let userObj = user.toObject();
	delete userObj.password;
	delete userObj.providerUID;
	return userObj;
};

module.exports = router;