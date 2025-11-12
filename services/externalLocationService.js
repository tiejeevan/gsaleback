const fetch = require('node-fetch');
const locationService = require('./locationService');

/**
 * Get user's real public IP and location using external API
 * This is useful for development/localhost where req.ip is 127.0.0.1
 * @returns {Promise<object>} Location data
 */
exports.getRealPublicIPLocation = async () => {
  // Try multiple services in order
  const services = [
    {
      name: 'ip-api.com',
      url: 'http://ip-api.com/json/',
      parser: (data) => ({
        country: data.countryCode,
        country_name: data.country,
        region: data.region,
        city: data.city,
        timezone: data.timezone,
        latitude: data.lat,
        longitude: data.lon,
        isExternal: true
      })
    },
    {
      name: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      parser: (data) => ({
        country: data.country_code || data.country,
        country_name: data.country_name,
        region: data.region_code || data.region,
        city: data.city,
        timezone: data.timezone,
        latitude: data.latitude,
        longitude: data.longitude,
        isExternal: true
      })
    }
  ];

  for (const service of services) {
    try {
      console.log(`🌐 Trying ${service.name}...`);
      const response = await fetch(service.url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ ${service.name} response:`, data);
      
      const locationData = service.parser(data);
      
      // Add currency and language
      return locationService.getCompleteLocationInfo(locationData.country, locationData);
    } catch (error) {
      console.error(`❌ ${service.name} failed:`, error.message);
      continue; // Try next service
    }
  }
  
  // All services failed, return default
  console.error('❌ All external location services failed');
  return {
    country: 'US',
    country_name: 'United States',
    region: 'CA',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles',
    latitude: 37.7749,
    longitude: -122.4194,
    isDefault: true,
    error: 'All services failed'
  };
};

/**
 * Get location with fallback to external API for localhost
 * @param {string} ip - IP address from request
 * @returns {Promise<object>} Location data
 */
exports.getLocationWithFallback = async (ip) => {
  // Check if it's localhost/private IP
  const isPrivate = !ip || 
                    ip === '::1' || 
                    ip === '127.0.0.1' || 
                    ip.startsWith('192.168.') || 
                    ip.startsWith('10.') ||
                    ip.startsWith('::ffff:127.') ||
                    ip.startsWith('::ffff:192.168.');
  
  if (isPrivate) {
    console.log('🔄 Private IP detected, fetching real public IP location...');
    return await this.getRealPublicIPLocation();
  }
  
  // Use geoip-lite for public IPs
  return locationService.getLocationFromIP(ip);
};
