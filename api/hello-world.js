module.exports = (req, res) => {
  res.json({ message: 'Hello World!', timestamp: new Date().toISOString() });
};
