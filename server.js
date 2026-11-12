require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Models ----------
const User = mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["donor", "receiver"], required: true },
  phone: String,
}, { timestamps: true }));

const Food = mongoose.model("Food", new mongoose.Schema({
  title: { type: String, required: true },
  quantity: { type: String, required: true },       // e.g. "50 plates"
  servings: { type: Number, default: 0 },           // number, used for impact stats
  description: String,
  pickupAddress: { type: String, required: true },
  expiryTime: { type: Date, required: true },
  status: { type: String, enum: ["available", "claimed", "collected"], default: "available" },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true }));

// ---------- Middleware ----------
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
const onlyRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ message: `Only ${role}s allowed` });

// ---------- Auth ----------
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "Missing fields" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ message: "Email already registered" });
    await User.create({ name, email, role, phone, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ message: "Registered successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(password || "", user.password)))
      return res.status(400).json({ message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- Food ----------
// Donor posts food
app.post("/api/food", auth, onlyRole("donor"), async (req, res) => {
  try {
    const { title, quantity, servings, description, pickupAddress, expiryTime } = req.body;
    if (new Date(expiryTime) <= new Date())
      return res.status(400).json({ message: "Expiry time must be in the future" });
    const food = await Food.create({
      title, quantity, servings, description, pickupAddress, expiryTime, donor: req.user.id,
    });
    res.status(201).json(food);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// Available food (not expired)
app.get("/api/food", auth, async (req, res) => {
  const foods = await Food.find({ status: "available", expiryTime: { $gt: new Date() } })
    .populate("donor", "name phone")
    .sort({ expiryTime: 1 });
  res.json(foods);
});

// My activity: donor's posts, or receiver's claims
app.get("/api/food/mine", auth, async (req, res) => {
  const filter = req.user.role === "donor" ? { donor: req.user.id } : { claimedBy: req.user.id };
  const foods = await Food.find(filter)
    .populate("donor", "name phone")
    .populate("claimedBy", "name phone")
    .sort({ createdAt: -1 });
  res.json(foods);
});

// Receiver claims (atomic: only one receiver can win)
app.put("/api/food/:id/claim", auth, onlyRole("receiver"), async (req, res) => {
  const food = await Food.findOneAndUpdate(
    { _id: req.params.id, status: "available", expiryTime: { $gt: new Date() } },
    { status: "claimed", claimedBy: req.user.id },
    { new: true }
  );
  if (!food) return res.status(400).json({ message: "Already claimed, expired or not found" });
  res.json(food);
});

// Receiver marks collected
app.put("/api/food/:id/collect", auth, onlyRole("receiver"), async (req, res) => {
  const food = await Food.findOneAndUpdate(
    { _id: req.params.id, claimedBy: req.user.id, status: "claimed" },
    { status: "collected" },
    { new: true }
  );
  if (!food) return res.status(400).json({ message: "Not allowed" });
  res.json(food);
});

// Donor deletes own un-claimed post
app.delete("/api/food/:id", auth, onlyRole("donor"), async (req, res) => {
  const food = await Food.findOneAndDelete({ _id: req.params.id, donor: req.user.id, status: "available" });
  if (!food) return res.status(400).json({ message: "Cannot delete (already claimed or not yours)" });
  res.json({ message: "Deleted" });
});

// Public impact stats
app.get("/api/stats", async (req, res) => {
  const collected = await Food.find({ status: "collected" }, "servings");
  res.json({
    donations: collected.length,
    servingsSaved: collected.reduce((s, f) => s + (f.servings || 0), 0),
  });
});

// ---------- Start ----------
mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(process.env.PORT || 5000, () =>
    console.log("Server running on port", process.env.PORT || 5000)))
  .catch((err) => console.error("DB connection error:", err));
