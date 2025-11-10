const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');

// Run admin actions test
router.post('/admin-actions', async (req, res) => {
  const { username, password } = req.body;
  
  const scriptPath = path.join(__dirname, '../test-admin-actions.js');
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error('Test execution error:', error);
      return res.status(500).json({ error: 'Test execution failed', details: error.message });
    }

    // Parse the output to extract results
    const results = parseTestOutput(stdout);
    
    res.json(results);
  });
});

// Run real-time features test
router.post('/realtime', async (req, res) => {
  const scriptPath = path.join(__dirname, '../test-realtime-features.js');
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error && !stdout.includes('TEST SUMMARY')) {
      console.error('Test execution error:', error);
      return res.status(500).json({ error: 'Test execution failed', details: error.message });
    }

    // Parse the output to extract results
    const results = parseTestOutput(stdout);
    
    res.json(results);
  });
});

// Helper function to parse test output
function parseTestOutput(output) {
  const lines = output.split('\n');
  const results = [];
  let passed = 0;
  let failed = 0;

  lines.forEach(line => {
    if (line.includes('✅')) {
      const match = line.match(/✅\s+(.+?):\s+(.+)/);
      if (match) {
        results.push({
          name: match[1].trim(),
          status: 'passed',
          message: match[2].trim(),
          timestamp: new Date().toISOString()
        });
        passed++;
      }
    } else if (line.includes('❌')) {
      const match = line.match(/❌\s+(.+?):\s+(.+)/);
      if (match) {
        results.push({
          name: match[1].trim(),
          status: 'failed',
          message: match[2].trim(),
          timestamp: new Date().toISOString()
        });
        failed++;
      }
    }
  });

  return {
    results,
    summary: {
      passed,
      failed,
      total: passed + failed
    },
    output
  };
}

module.exports = router;
