import dbHelper from "../database/dbHelper";
import {createUserAccount} from "../blockchain/ethNode";
import {USER_LEVEL} from "../utils";
import nodemailer from "nodemailer";
import {PASSWORD} from "../passwords";

/* handles the api call to register the user and insert them into the users table.
  The req body should contain an email and a password. */
async function registerUser(req, res) {

    if (req.body.email == null || req.body.password == null || req.body.authorityLevel == null ||
        req.body.authLevel == null || req.body.forename == null || req.body.surname == null ||
        req.body.companyName == null || req.body.creationDate == null) {
        console.log("Invalid request on register-user: ", req.body);
        res.status(400);
        res.json({
            "message": "Request has to include: email, password, authorityLevel, forename," +
            "surname, companyName & creationDate in the body and bearer_token in the header"
        });
        return;
    }

    if (req.body.authorityLevel !== USER_LEVEL.ASTVA) {
        res.status(401);
        res.json({
            "message": "User is not authorized to register new user"
        });

        return;
    }

    const doesUserExist = await dbHelper.doesUserExist(req.body.email);
    if (doesUserExist) {
        res.status(400);
        res.json({
            "message": "Es existiert bereits ein Benutzer mit der E-Mail-Adresse."
        });

        return;
    }

    const userKeys = await createUserAccount();

    if (userKeys == null) {
        console.log("Error while creating new userAccount");
        res.status(500);
        res.json({
            "message": "Error while creating new userAccount"
        });
        return;
    }

    const registerResult = await dbHelper.registerUserInDB(
        req.body.email,
        req.body.password,
        userKeys.privateKey,
        userKeys.publicKey,
        req.body.authLevel,
        req.body.forename,
        req.body.surname,
        req.body.companyName,
        req.body.creationDate,
        false
    );

    if (registerResult == null) {
        res.status(500);
        res.json({
            "message": "Fehler bei der Registrierung."
        });
    }
    else {
        res.status(200);
        res.json({
            "message": "Der Benutzer wurde erfolgreich erstellt."
        });
    }
}

async function blockUser(req, res) {

    if (req.body.email == null) {
        console.log("Invalid request on register-user: ", req.body);
        res.status(400);
        res.send({
            "message": "Request has to include: email in the body and bearer_token in the header"
        });
        return;
    }
    const email = req.body.email;

    if (req.body.authorityLevel !== USER_LEVEL.ASTVA) {
        res.status(401);
        res.json({
            "message": "User is not authorized to block user"
        });

        return;
    }

    const doesUserExists = await dbHelper.doesUserExist(email);

    if (!doesUserExists) {
        res.status(400);
        res.send({
            "message": "Der Benutzer wurde nicht gefunden."
        });

        return;
    }

    const blockResult = await dbHelper.blockUserInDB(email);

    if (blockResult != null && blockResult.length === 0) {
        res.status(200);
        res.json({
            "message": "Der Benutzer wurde erfolgreich entfernt."
        });
    }
    else {
        res.status(500);
        res.json({
            "message": "Der Benutzer konnte aufgrund eines Serverfehlers nicht gelöscht werden."
        });
    }
}

//VINI.de/api/users
async function getUsers(req, res) {

    if (req.body.authorityLevel !== USER_LEVEL.ASTVA) {
        res.status(401);
        res.json({
            "message": "User is not authorized to retrieve user data"
        });

        return;
    }

    const users = await dbHelper.getAllUsers();

    if (users != null) {
        res.status(200);
        res.json({
            "users": users
        });
    }
    else {
        res.status(500);
        res.json({ "message": "Datenbankverbindung fehlgeschlagen." });
    }
}


function login(req, res) {
    console.log("Authorization successful");
    let status = req.body.blocked !== null && req.body.blocked === false ? "success" : "failure";
    let authLevel = req.body.authorityLevel !== null ? req.body.authorityLevel : 0;

    const loginBody = {
        loginStatus: status,
        authorityLevel: authLevel
    };

    res.status(200);
    res.json(loginBody);
}

async function isAuthorised(req, res, next) {

    if (req.get("Authorization") == null) {
        errorHandling(res, 406, "No bearer_token found in header.");
        return;
    }
    const token = req.get("Authorization").slice("Bearer ".length);

    // Prüfen, ob der User deaktiviert ist
    const authResult = await dbHelper.checkUserAuthorization(token);

    if (authResult == null || authResult.length === 0) {
        errorHandling(res, 403, "Bitte neu einloggen.");
    }
    else if ((Date.parse(authResult[3]) - Date.now()) < 0) {
        errorHandling(res, 401, "Das Bearer-Token ist abgelaufen.");
    }
    else if (authResult[0] === true) {
        errorHandling(res, 401, "Der Benutzer wurde blockiert.");
    }
    else {
        req.body.blocked = authResult[0];
        req.body.authorityLevel = authResult[2];
        console.log("Check user authorization result: ", req.body.blocked, req.body.authorityLevel);
        next();
    }
}

function errorHandling(response, status, message) {
    const url = require('url');
    const query = url.format({
        pathname: '/error',
        query: {
            "status": status,
            "message": message
        }
    });

    response.redirect(query);
}

async function statusMessage(req, res) {

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'maildeamon.vini@gmail.com',
            pass: PASSWORD.MAILACCOUNT,
        }
    });

    userInfo = await dbHelper.getUserInfoFromToken(req.get("Authorization").slice("Bearer ".length));

    let mailOptions = {
        from: 'maildeamon.vini@gmail.com',
        to: userInfo.email,
        subject: 'Annulment request status update - Accepted',
        text: 'Your annulment request for car XX was accepted/rejected.'
    };

    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

module.exports = {
    "registerUser": registerUser,
    "login": login,
    "isAuthorised": isAuthorised,
    "blockUser": blockUser,
    "getUsers": getUsers,
    "errorHandling": errorHandling,
    "statusMessage": statusMessage
};