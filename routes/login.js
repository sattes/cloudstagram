var bcrypt = require('bcrypt')
var redis = require('redis')
;

function userKey(username) {
    return "user:" + username;
}

// Used to generate a hash of the plain-text password + salt
function hash(pass, salt) {
    return bcrypt.hashSync(pass, salt);
}

function generateSalt() {
    return bcrypt.genSaltSync(10);
}

// Authenticate using our plain-object database of doom!
function authenticate(name, pass, fn) {
    console.log('authenticating %s:%s', name, pass);
    //get user from redis. User is a hash
    var client = redis.createClient();
    client.HGETALL([userKey(name)], function (err, obj) {
        client.quit();
        if (err || obj == null) {
            console.log('cannot find user');
            return fn(new Error('cannot find user'));
        } else {
            console.log("got reply: ", obj);
            var user = {
                name: obj.name.toString(),
                salt: obj.salt.toString(),
                pass: obj.pass.toString()
            };
            if (user.pass == hash(pass, user.salt)) return fn(null, user);
            fn(new Error('invalid password'));
        }
    });
}

exports.register = function(req, res) {
    var error = req.session.error;
    delete req.session.error;
    res.render('register', { 
        title: 'Cloudstagram - Register',
        error: error,
        username: null
    });
};

exports.addUser = function(req, res) {
    console.log("addUser: ", req.body.username, req.body.password);    
    if (!req.session.user) {
        var username = req.body.username, 
        password = req.body.password;
        var client = redis.createClient();
        
        client.exists(userKey(username), function(error, data) {
            if (data != 1) {
                var salt = generateSalt();
                user = {
                    name: username,
                    salt: salt,
                    pass: hash(password, salt)
                };
                client.hmset(userKey(username), user, function(error, reply) {
                    if (reply == "OK") {
                        req.session.regenerate(function(){
                            client.quit();
                            req.session.user = user;
                            res.redirect('/');
                        });
                    } else {
                        req.session.error = "Can't create user. Please try again later";
                        res.redirect('/register');
                    }
                });
            } else {
                req.session.error = "Username: " + username + " already exists." +
                    + "Please try again with a different user name ";
                res.redirect('/register');
            }
        });
    } 
    res.redirect('/');
};

exports.login = function(req, res) {
    var error = req.session.error;
    delete req.session.error;
    console.log('serving login form: ', error);
    //serves login form
    res.render('login', { 
        title: 'Cloudstagram - Login', 
        error: error,
        username: null
    });
};

exports.auth = function(req, res) {
    authenticate(req.body.username, req.body.password, function(err, user){
        if (user) {
            // Regenerate session when signing in
            // to prevent fixation 
            req.session.regenerate(function(){
                req.session.user = user;
                res.redirect('back');
            });
        } else {
            console.log('auth error:', err);
            req.session.error = 'Authentication failed, please check your '
                + ' username and password.';
            res.redirect('/login');
        }
    });
};

exports.logout = function(req, res) {
    req.session.destroy(function() {
        res.redirect('/login');
    });
};