import Transaction from "../blockchain/transaction";
import ethNode from "../blockchain/ethNode";
import dbHelper from "../database/dbHelper";
import {getTimestamp, USER_LEVEL, TRANS_HASH_SIZE} from "../utils";

async function updateMileage(req, res) {

    if (req.body.vin == null || req.get("Authorization") == null || req.body.timestamp == null || req.body.mileage == null) {
        console.log("Invalid request on updating mileage: ", req.body, req.get("Authorization"));
        res.status(400);
        res.json({
            "message": "Request has to include: vin, timestamp and a mileage value in body and bearer_token in header.Authorization"
        });
        return;
    }

    if (!(req.body.authorityLevel === USER_LEVEL.ZWS || req.body.authorityLevel === USER_LEVEL.TUEV || req.body.authorityLevel === USER_LEVEL.STVA || req.body.authorityLevel === USER_LEVEL.ASTVA)) {
        res.status(401);
        res.json({
            "message": "User is not authorized to update mileage for car"
        });

        return;
    }

    let carAddress = await dbHelper.getCarAddressFromVin(req.body.vin);
    if (carAddress === null) {
        console.log("vin not found! aborting.");
        res.status(400);
        res.json({"message": "Fahrzeug nicht gefunden!"});
        return;
    }

    const token = req.get("Authorization").slice("Bearer ".length);
    const userInfo = await dbHelper.getUserInfoFromToken(token);

    if (userInfo == null) {
        console.log("Could not find user for token <" + token + ">");
        res.status(400);
        res.json({
            "message": "Could not find user for token <" + token + ">"
        });
        return;
    }

    let preTransaction = await dbHelper.getHeadTransactionHash(carAddress);
    if (preTransaction == null || preTransaction === 0) {
        console.log("Error while getting preTransaction from DB");
        res.status(500);
        res.json({
            "message": "Error while getting preTransaction from DB"
        });
        return;
    }

    const transaction = new Transaction(userInfo.publicKey, userInfo.email, req.body.vin, preTransaction, carAddress, req.body.timestamp);
    transaction.setMileage(req.body.mileage);

    const transHash = await ethNode.sendSignedTransaction(transaction, userInfo.privateKey);

    if (transHash == null) {
        console.log("An error occurred while sending transaction: ", transaction);
        res.status(500);
        res.json({
            "message": "Die Transaktion konnte nicht durchgeführt werden!"
        });
    }

    res.status(200);
    res.json({
        "message": "Transaktion erfolgreich durchgeführt"
    });
}

async function getCarByVin(req, res) {
    // TODO delete me (when this is working)
    if (req.query.vin === "dummy" || req.query.vin === "W0L000051T2123456") {

        let transactionPayload = [];

        // mit einer 0 auffüllen)
        let payloadItem1 = {
            timestamp: getTimestamp(),
            mileage: 1337,
            service1: false,
            service2: true,
            oilChange: false,
            mainInspection: true,
            nextCheck: getTimestamp(),
            ownerCount: 4,
            entrant: "d@d.de",
            state: "valid",
            transactionId: "123456"
        };
        let payloadItem2 = {
            timestamp: getTimestamp(),
            mileage: 1338,
            service1: true,
            service2: true,
            oilChange: false,
            mainInspection: true,
            nextCheck: getTimestamp(),
            ownerCount: 5,
            entrant: "c@c.de",
            state: "invalid",
            transactionId: "123457"
        };
        let payloadItem3 = {
            timestamp: getTimestamp(),
            mileage: 1339,
            service1: false,
            service2: true,
            oilChange: true,
            mainInspection: false,
            nextCheck: getTimestamp(),
            ownerCount: 5,
            entrant: "b@b.de",
            state: "rejected",
            transactionId: "123458"
        };
        let payloadItem4 = {
            timestamp: getTimestamp(),
            mileage: 1339,
            service1: false,
            service2: true,
            oilChange: true,
            mainInspection: false,
            nextCheck: getTimestamp(),
            ownerCount: 5,
            entrant: "a@a.de",
            state: "open",
            transactionId: "123459"
        };

        transactionPayload.push(payloadItem1);
        transactionPayload.push(payloadItem2);
        transactionPayload.push(payloadItem3);
        transactionPayload.push(payloadItem4);

        res.json({
            "vin": req.query.vin,
            "payload": transactionPayload
        });
    } else {

        if (req.query.vin == null) {
            console.log("Invalid request on getCarByVin");
            res.status(400);
            res.json({
                "message": "invalid/no vin supplied."
            });
            return false;
        }

        let carAddress = await dbHelper.getCarAddressFromVin(req.query.vin);
        if (carAddress === null) {
            console.log("vin not found! aborting.");
            res.status(400);
            res.json({"message": "Fahrzeug nicht gefunden!"});
            return;
        }

        let headTxHash = await dbHelper.getHeadTransactionHash(carAddress);
        if (headTxHash === null) {
            console.log("Head transaction hash not found! aborting.");
            res.status(400);
            res.json({"message": "Fahrzeug nicht gefunden!"});
            return;
        }

        const transactions = await ethNode.getAllTransactions(headTxHash);
        if (transactions == null) {
            console.log("Could not find vin in blockchain");
            res.status(400);
            res.json({"message": "Fahrzeug nicht gefunden!"});
            return;
        }

        let transactionPayload = transactions.map((element) => {
            return {
                timestamp: element.data.timestamp,
                mileage: element.data.mileage,
                service1: element.data.serviceOne,
                service2: element.data.serviceTwo,
                oilChange: element.data.oilChange,
                mainInspection: element.data.mainInspection,
                nextCheck: element.data.nextCheck,
                ownerCount: element.data.preOwner,
                entrant: element.data.email,
                state: element.data.state
            }
        });

        res.status(200);
        res.json({
            "vin": req.query.vin,
            "payload": transactionPayload
        });
    }
}

async function shopService(req, res) {
    if (req.body.vin == null || req.get("Authorization") == null || req.body.timestamp == null ||
        req.body.mileage == null || req.body.service1 == null || req.body.service2 == null ||
        req.body.oilChange == null) {
        console.log("Invalid request on shop service: ", req.body, req.get("Authorization"));
        res.status(400);
        res.json({
            "message": "Request has to include: vin, bearer_token, timestamp, mileage, service1," +
            " service2 + oilchange"
        });
        return;
    }

    if (req.body.authorityLevel !== USER_LEVEL.ZWS) {
        res.status(401);
        res.json({
            "message": "User is not authorized to make service entry for car"
        });

        return;
    }

    const carAddress = await dbHelper.getCarAddressFromVin(req.body.vin);
    if (carAddress === null) {
        console.log("vin not found! aborting.");
        res.status(400);
        res.json({"message": "Fahrzeug nicht gefunden!"});
        return;
    }

    const token = req.get("Authorization").slice("Bearer ".length);
    const userInfo = await dbHelper.getUserInfoFromToken(token);

    if (userInfo == null) {
        console.log("Could not find user for token <" + token + ">");
        res.status(400);
        res.json({
            "message": "Could not find user for token <" + token + ">"
        });
        return;
    }

    let preTransaction = await dbHelper.getHeadTransactionHash(carAddress);
    if (preTransaction == null || preTransaction.length === 0) {
        console.log("Error while getting preTransaction from DB");
        res.status(500);
        res.json({
            "message": "Error while getting preTransaction from DB"
        });
        return;
    }

    const transaction = new Transaction(userInfo.publicKey, userInfo.email, req.body.vin, preTransaction, carAddress, req.body.timestamp);
    transaction.setMileage(req.body.mileage);
    transaction.setServiceOne(req.body.service1);
    transaction.setServiceTwo(req.body.service2);
    transaction.setOilChange(req.body.oilChange);

    const transHash = await ethNode.sendSignedTransaction(transaction, userInfo.privateKey);

    if (transHash == null) {
        console.log("An error occurred while sending transaction: ", transaction);
        res.status(500);
        res.json({
            "message": "Entering shop-service failed"
        });
    }

    res.status(200);
    res.json({
        "message": "Transaktion erfolgreich durchgeführt!"
    });
}

async function tuevEntry(req, res) {
    const token = req.get("Authorization").slice("Bearer ".length);

    if (req.body.vin == null || token == null || req.body.timestamp == null ||
        req.body.mileage == null || req.body.nextCheck == null) {
        console.log("Invalid request on tuev-report: ", req.body, req.get("Authorization"));
        res.status(400);
        res.json({
            "message": "Request has to include: vin, bearer_token, timestamp, mileage + nextCheck "
        });
        return;
    }

    if (req.body.authorityLevel !== USER_LEVEL.TUEV) {
        res.status(401);
        res.json({
            "message": "User is not authorized to make inspection entry for car"
        });

        return;
    }

    const carAddress = await dbHelper.getCarAddressFromVin(req.body.vin);
    if (carAddress === null) {
        console.log("vin not found! aborting.");
        res.status(400);
        res.json({"message": "Fahrzeug wurde nicht gefunden!"});
        return;
    }

    const userInfo = await dbHelper.getUserInfoFromToken(token);

    if (userInfo == null) {
        console.log("Could not find user for token <" + token + ">");
        res.status(400);
        res.json({
            "message": "Could not find user for token <" + token + ">"
        });
        return;
    }

    let preTransaction = await dbHelper.getHeadTransactionHash(carAddress);

    if (preTransaction == null || preTransaction.length === 0) {
        console.log("Error while getting preTransaction from DB");
        res.status(500);
        res.json({
            "message": "Error while getting preTransaction from DB"
        });
        return;
    }

    const transaction = new Transaction(userInfo.publicKey, userInfo.email, req.body.vin, preTransaction, carAddress, req.body.timestamp);
    transaction.setMileage(req.body.mileage);
    transaction.setMainInspection(true);
    transaction.setNextCheck(req.body.nextCheck);

    const transHash = await ethNode.sendSignedTransaction(transaction, userInfo.privateKey);

    if (transHash == null) {
        console.log("An error occurred while sending transaction: ", transaction);
        res.status(500);
        res.json({
            "message": "Die Transaktion konnte nicht durchgeführt werden!"
        });
    }

    res.status(200);
    res.json({
        "message": "Transaktion erfolgreich durchgeführt"
    });
}

async function stvaRegister(req, res) {

    if (req.body.vin == null || req.get("Authorization") == null || req.body.timestamp == null ||
        req.body.mileage == null || req.body.ownerCount == null) {
        console.log("Invalid request on stva-register: ", req.body, req.get("Authorization"));
        res.status(400);
        res.json({
            "message": "Request has to include: vin, bearer_token, timestamp, mileage + ownerCount "
        });
        return;
    }

    if (!(req.body.authorityLevel === USER_LEVEL.STVA || req.body.authorityLevel === USER_LEVEL.ASTVA)){
        console.log("User is not authorized to update registration data for car");
        res.status(401);
        res.json({
            "message": "User is not authorized to update registration data for car"
        });

        return;
    }

    let carAddress = await dbHelper.getCarAddressFromVin(req.body.vin);
    let preTransaction = null;
    if (carAddress == null) {
        console.log("carAddress not found: Creating new one");
        // VIN not in DB yet -> Create it
        const carAccount = ethNode.createCarAccount();
        carAddress = carAccount.publicKey;

        const result = await dbHelper.registerCarInDB(req.body.vin, carAccount.privateKey, carAccount.publicKey, req.body.timestamp);

        if (result == null) {
            console.log("Error while registering new car");
            res.status(500);
            res.json({
                "message": "Die Transaktion konnte nicht durchgeführt werden!"
            });
            return;
        }
    } else { //car already exists, update
        preTransaction = await dbHelper.getHeadTransactionHash(carAddress);
        if (preTransaction == null || preTransaction.length === 0) {
            console.log("Error while getting preTransaction from DB");
            res.status(500);
            res.json({
                "message": "Error while getting preTransaction from DB"
            });
            return;
        }
    }

    const token = req.get("Authorization").slice("Bearer ".length);
    const userInfo = await dbHelper.getUserInfoFromToken(token);

    if (userInfo == null) {
        console.log("Could not find user for token <" + token + ">");
        res.status(400);
        res.json({
            "message": "Could not find user for token <" + token + ">"
        });
        return;
    }

    const transaction = new Transaction(userInfo.publicKey, userInfo.email, req.body.vin, preTransaction, carAddress, req.body.timestamp);
    transaction.setMileage(req.body.mileage);
    transaction.setPreOwner(req.body.ownerCount);

    const transHash = await ethNode.sendSignedTransaction(transaction, userInfo.privateKey);

    if (transHash == null) {
        console.log("An error occurred while sending transaction: ", transaction);
        res.status(500);
        res.json({
            "message": "Die Transaktion konnte nicht durchgeführt werden!"
        });
    }

    res.status(200);
    res.json({
        "message": "Transaktion erfolgreich durchgeführt!"
    });
}

async function getAllAnnulmentTransactions(req, res) {

    if (!(req.body.authorityLevel === USER_LEVEL.STVA || req.body.authorityLevel === USER_LEVEL.ASTVA)){
        console.log("User is not authorized to retrieve annulment transactions");
        res.status(401);
        res.json({
            "message": "User is not authorized to retrieve annulment transactions"
        });

        return;
    }

    const results = await dbHelper.getAllAnnulmentTransactions();
    if (results === null) {
        res.status(500);
        res.json({
            "message": "Die Annulierungs-Transaktionen konnten nicht geladen werden!"
        });
    }
    else {
        //let annulmentPayload = [];
        let transaction = await ethNode.getTransaction(results[0]);

        const vin = await dbHelper.getVinByPublicKey(transaction.to);
        const user = await dbHelper.getUserInfoFromToken(req.get("Authorization").slice("Bearer ".length));
        const userEmail = await dbHelper.getUserByID(results[2]);

        const state = results[1] === true ? "pending" : "invalid";

        console.log(results)
        const annulment = {
            date: transaction.data.timestamp,
            vin: vin[0],
            mileage: transaction.data.mileage,
            ownerCount: transaction.data.ownerCount,
            entrant: user.email,
            mainInspection: transaction.data.mainInspection,
            service1: transaction.data.serviceOne,
            service2: transaction.data.serviceTwo,
            oilChange: transaction.data.oilChange,
            applicant: userEmail[0],
            state: state,
            transactionHash: results[0]
        };
        // from : user publicKey
        // to:  kfz publicKey

        // benötigt werden folgende Attribute:
        // [x] date // Transaktion von wann?
        // [x] vin
        // [x] mileage
        // [x] ownerCount
        // [x] entrant
        // [x] mainInspection
        // [x] service1
        // [x] service2
        // [x] oilChange
        // [x] applicant // wer hat den Antrag erstellt? (aus der DB) -> userID aus annulment_transactions
        // [x] state    "pending"     nicht bearbeitet
        //     "invalid"     angenommen (heißt aus Kompatibilitätsgründen so)
        // [x] transactionHash

        res.json({ "annulments": [
            annulment,
            //2. annulment,
            // ...
        ]

        });
    }
}

async function insertAnnulmentTransaction(req, res) {

    const hash = req.body.transactionHash;
    const token = req.get("Authorization").slice("Bearer ".length);

    if (hash == null || hash.length < TRANS_HASH_SIZE || token == null) {
        console.log("Invalid request for annulment. To create an annulment transaction a transactionHash and a userId is required.");
        res.status(400);
        res.json({
            "message": "Invalid request for annulment. To create an annulment transaction a transactionHash and a userId is required."
        });
        return;
    }

    const creator = await dbHelper.getUserInfoFromToken(token);

    if (creator == null || creator.length === 0) {
        console.log("Could not get creator from bearer token:", token);
        res.status(500);
        res.json({
            "message": "Could not get creator from bearer token: " + token
        });
        return;
    }

    const annulment = await dbHelper.getAnnulment(hash);

    if (annulment != null) {
        console.log("Annulment transaction already exists.");
        res.status(409);
        res.json({
            "message": "Annulment transaction already exists."
        });
        return;
    }

    const transaction = await ethNode.getTransaction(hash);

    if (transaction == null) {
        console.log("No transaction found with hash:", hash);
        res.status(400);
        res.json({
            "message": "No transaction found with hash: " + hash
        });
        return;
    }

    const insertResult = await dbHelper.insertAnnulment(hash, creator.id);

    if (insertResult == null) {
        console.log("Could not insert annulment transaction in DB");
        res.status(500);
        res.json({
            "message": "Could not insert annulment transaction in DB"
        });
        return;
    }

    res.status(200);
    res.json({
        "message": "Successfully inserted annulment transaction"
    });
}

async function rejectAnnulmentTransaction(req, res) {

    const hash = req.body.transactionHash;

    if (hash == null || hash.length < TRANS_HASH_SIZE) {
        console.log("Invalid request to reject an annulment. A transactionHash is required.");
        res.status(400);
        res.json({
            "message": "Invalid request to reject an annulment. A transactionHash is required."
        });
        return;
    }

    const annulment = await dbHelper.getAnnulment(hash);

    if (annulment == null) {
        console.log("Could not find annulment transaction with hash " + hash);
        res.status(400);
        res.json({
            "message": "Could not find annulment transaction with hash " + hash
        });
        return;
    }

    const deletion = await dbHelper.rejectAnnulment(hash);

    if (deletion == null) {
        console.log("Error while deleting annulment transaction from DB.");
        res.status(500);
        res.json({
            "message": "Error while deleting annulment transaction from DB."
        });
        return;
    }

    res.status(200);
    res.json({
        "message": "Successfully rejected annulment transaction"
    });
}

async function acceptAnnulmentTransaction(req, res) {

    const hash = req.body.transactionHash;
    const token = req.get("Authorization").slice("Bearer ".length);

    if (hash == null || hash.length < TRANS_HASH_SIZE || token == null) {
        console.log("Invalid request to reject an annulment. A transactionHash and a userId is required.");
        res.status(400);
        res.json({
            "message": "Invalid request to reject an annulment. A transactionHash and a userId is required."
        });
        return;
    }

    const stvaEmployee = await dbHelper.getUserInfoFromToken(token);

    if (stvaEmployee == null || stvaEmployee.length === 0) {
        console.log("Could not get stvaEmployee from bearer token:", token);
        res.status(500);
        res.json({
            "message": "Could not get stvaEmployee from bearer token: " + token
        });
        return;
    }

    // Get annulmentTransaction from DB annulment_transaction
    const annulment = await dbHelper.getAnnulment(hash);

    if (annulment == null) {
        console.log("Could not find annulment transaction with hash " + hash);
        res.status(400);
        res.json({
            "message": "Could not find annulment transaction with hash " + hash
        });
        return;
    }

    // Get Transaction which should be annulled
    const annulmentTarget = await ethNode.getTransaction(hash);

    if (annulmentTarget == null) {
        console.log("No transaction found with hash:", hash);
        res.status(400);
        res.json({
            "message": "No transaction found with hash: " + hash
        });
        return;
    }

    // Get preTransaction Hash from the publicKey of the car
    const preTransaction = await dbHelper.getHeadTransactionHash(annulmentTarget.to);

    // Get Information about the original creator of the annulment transaction
    const creator = await dbHelper.getUserInfoFromUserId(annulment.userId);

    //TODO: getTimestamp() sollte nicht benötigt werden, da Patrick den Timestamp immer übergeben will.
    const transaction = new Transaction(stvaEmployee.publicKey, creator.email, annulmentTarget.data.vin, preTransaction, annulmentTarget.to, getTimestamp());
    transaction.setAnnulmentTarget(annulmentTarget.hash);

    const result = await ethNode.sendSignedTransaction(transaction, stvaEmployee.privateKey);

    if (result == null) {
        console.log("Error while accepting annulmentTransaction.");
        res.status(500);
        res.json({
            "message": "Error while accepting annulmentTransaction."
        });
        return;
    }

    const pendingResult = await dbHelper.acceptAnnulment(annulment.transactionHash);

    if (pendingResult == null) {
        console.log("Error while updating pending annulmentTransaction");
        res.status(500);
        res.json({
            "message": "Error while updating pending annulmentTransaction"
        });
        return;
    }

    res.status(200);
    res.json({
        "message": "Successfully accepted annulmentTransaction"
    });
}


module.exports = {
    "updateMileage": updateMileage,
    "shopService": shopService,
    "tuevEntry": tuevEntry,
    "stvaRegister": stvaRegister,
    "getCarByVin": getCarByVin,
    "getAllAnnulmentTransactions": getAllAnnulmentTransactions,
    "insertAnnulmentTransaction": insertAnnulmentTransaction,
    "rejectAnnulmentTransaction": rejectAnnulmentTransaction,
    "acceptAnnulmentTransaction": acceptAnnulmentTransaction
};