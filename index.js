"use strict";

const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const bodyParser = require("body-parser");

const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// mongoose.set("debug", function (collectionName, method, query, doc) {
//   console.log(
//     collectionName,
//     method,
//     JSON.stringify(query),
//     JSON.stringify(doc)
//   );
// });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minLength: 3,
  },
  exercises: [
    {
      description: {
        type: String,
        required: true,
      },
      duration: {
        type: Number,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const User = new mongoose.model("User", userSchema, "users");

app.use(cors());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.post("/api/users/:_id/exercises", (req, res) => {
  const newExercise = {
    description: req.body.description,
    duration: req.body.duration,
  };
  if (req.body.date != "") newExercise.date = req.body.date;

  addExerciseToUserId(req.params._id, newExercise)
    .then((doc) => res.json(doc))
    .catch((err) => res.json({ error: err }));
});

app.post("/api/users", (req, res) => {
  addUser(req.body.username)
    .then((user) => res.json(user))
    .catch((err) => res.json({ error: err }));
});

app.get("/api/users", (req, res) => {
  listUsers()
    .then((users) => res.json(users))
    .catch((err) => res.json({ error: err }));
});

app.get("/api/users/:_id/logs?", (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  getUserLogs(userId, from, to, limit)
    .then((result) => {
      let userLogs = {
        _id: result._id,
        username: result.username,
        count: result.exercises.length,
        exercises: [result.exercises.map(r=> ({
          description: r.description,
          date: new Date(r.date).toDateString(),
          duration: r.duration
        }))]
      }

      res.json(userLogs)
    })
    .catch((err) => res.json({error: err}));

  
});


const getUserLogs = (userId, dateFrom, dateTo, limit) => {
  if (!dateFrom && !dateTo && !limit) return findUserById(userId);

  let cond = {};
  if (!parseInt(limit)) limit = 100;
  if (dateFrom) cond = { ...cond, $gte: ["$$exercise.date", { $dateFromString: { dateString: dateFrom } }] };
  if (dateTo) cond = {...cond, $lte: ['$$exercise.date', {$dateFromString: {dateString: `${dateTo} 23:59:59`}}]}
  if (dateFrom && dateTo) cond = {$and: [{$gte: cond['$gte']}, {$lte: cond['$lte']}]}
  
  const projection = {
    username: 1,
    exercises: {
      $slice: [{
        $filter: {
          input: "$exercises",
          as: "exercise",
          cond: cond
          }
        },
        parseInt(limit)],
    }
  };

  return User.aggregate([ {
      $match: { _id: new mongoose.Types.ObjectId(userId) },
    }, {
      $project: projection
    },
  ])
  .then(res => res[0])
  .catch(err=> {throw err})
}

const findUserById = (userId) =>
  User.findById(userId)
    .then((usr) => usr)
    .catch((err) => {
      throw "No user was found";
    });

const addExerciseToUserId = (userId, exercise) =>
  findUserById(userId).then((user) => {
    user.exercises.push(exercise);

    return user.save();
  });

const addUser = (username) =>
  new User({username: username}).save()
    .catch((err) => {
      if (err.index === 0 && err.keyPattern.username)
        throw "There is already a user with that username";
      if (err.name === "ValidationError" && err.errors.username) {
        switch (err.errors.username.kind) {
          case "required":
            throw "Username is a required field";
          case "minlength":
            throw "Username must be at least 3 characters long";
          default:
            throw err.errors.username.message;
        }
      }
      throw err;
    });

const listUsers = () =>
  User.find({}).select({ __v: false, "exercises._id": false }).exec();

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
