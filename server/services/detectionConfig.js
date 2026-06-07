function isRoboflowConfigured() {
  const apiKey = process.env.ROBOFLOW_API_KEY;
  const weaponProject = process.env.ROBOFLOW_PROJECT_WEAPON;

  if (!apiKey || !weaponProject) return false;
  if (apiKey === 'your_api_key_here') return false;
  if (weaponProject === 'weapon-detection-project-name') return false;

  return true;
}

module.exports = {
  isRoboflowConfigured,
};
