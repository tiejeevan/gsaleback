const geoip = require('geoip-lite');
const pool = require('../db');

/**
 * Get location data from IP address using geoip-lite
 * @param {string} ip - IP address
 * @returns {object} Location data
 */
exports.getLocationFromIP = (ip) => {
  console.log('📍 getLocationFromIP called with:', ip);
  
  // Handle localhost and private IPs
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    console.log('⚠️  Localhost/private IP detected');
    console.log('💡 TIP: Deploy to production or use external IP API for real location');
    console.log('💡 For now, using San Francisco as default for localhost');
    return {
      country: 'US',
      country_name: 'United States',
      region: 'CA',
      city: 'San Francisco',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      isLocalhost: true
    };
  }

  // Clean IPv6 mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
  const cleanIP = ip.replace(/^::ffff:/, '');
  console.log('🧹 Cleaned IP:', cleanIP);
  
  const geo = geoip.lookup(cleanIP);
  console.log('🌍 geoip.lookup result:', geo);
  
  if (!geo) {
    // Return default if lookup fails
    return {
      country: 'US',
      country_name: 'United States',
      region: 'CA',
      city: 'San Francisco',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      isDefault: true
    };
  }

  return {
    country: geo.country,
    country_name: this.getCountryName(geo.country),
    region: geo.region,
    city: geo.city || 'Unknown',
    timezone: geo.timezone,
    latitude: geo.ll ? geo.ll[0] : null,
    longitude: geo.ll ? geo.ll[1] : null,
    isLocalhost: false,
    isDefault: false
  };
};

/**
 * Get full country name from country code
 * @param {string} code - ISO 3166-1 alpha-2 country code
 * @returns {string} Full country name
 */
exports.getCountryName = (code) => {
  const countries = {
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'AU': 'Australia',
    'DE': 'Germany',
    'FR': 'France',
    'IT': 'Italy',
    'ES': 'Spain',
    'NL': 'Netherlands',
    'BE': 'Belgium',
    'CH': 'Switzerland',
    'AT': 'Austria',
    'SE': 'Sweden',
    'NO': 'Norway',
    'DK': 'Denmark',
    'FI': 'Finland',
    'PL': 'Poland',
    'CZ': 'Czech Republic',
    'IE': 'Ireland',
    'PT': 'Portugal',
    'GR': 'Greece',
    'RU': 'Russia',
    'IN': 'India',
    'CN': 'China',
    'JP': 'Japan',
    'KR': 'South Korea',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'AR': 'Argentina',
    'CL': 'Chile',
    'CO': 'Colombia',
    'ZA': 'South Africa',
    'EG': 'Egypt',
    'NG': 'Nigeria',
    'KE': 'Kenya',
    'SG': 'Singapore',
    'MY': 'Malaysia',
    'TH': 'Thailand',
    'ID': 'Indonesia',
    'PH': 'Philippines',
    'VN': 'Vietnam',
    'NZ': 'New Zealand',
    'AE': 'United Arab Emirates',
    'SA': 'Saudi Arabia',
    'IL': 'Israel',
    'TR': 'Turkey',
    'UA': 'Ukraine',
    'RO': 'Romania',
    'HU': 'Hungary',
    'BG': 'Bulgaria',
    'HR': 'Croatia',
    'RS': 'Serbia',
    'SK': 'Slovakia',
    'SI': 'Slovenia',
    'LT': 'Lithuania',
    'LV': 'Latvia',
    'EE': 'Estonia',
    'IS': 'Iceland',
    'LU': 'Luxembourg',
    'MT': 'Malta',
    'CY': 'Cyprus'
  };
  
  return countries[code] || code;
};

/**
 * Get currency for a country
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {object} Currency info
 */
exports.getCurrencyForCountry = (countryCode) => {
  const currencies = {
    'US': { code: 'USD', symbol: '$', name: 'US Dollar' },
    'CA': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    'GB': { code: 'GBP', symbol: '£', name: 'British Pound' },
    'EU': { code: 'EUR', symbol: '€', name: 'Euro' },
    'AU': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'JP': { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    'CN': { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    'IN': { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    'BR': { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    'MX': { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
    'ZA': { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
    'RU': { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
    'KR': { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    'SG': { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    'NZ': { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    'CH': { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
    'SE': { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    'NO': { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    'DK': { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
    'PL': { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
    'TR': { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    'AE': { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    'SA': { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    'IL': { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
    'TH': { code: 'THB', symbol: '฿', name: 'Thai Baht' },
    'MY': { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
    'ID': { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
    'PH': { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
    'VN': { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
    'EG': { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
    'NG': { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    'KE': { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    'AR': { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
    'CL': { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
    'CO': { code: 'COP', symbol: '$', name: 'Colombian Peso' },
    'UA': { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
    'CZ': { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
    'HU': { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
    'RO': { code: 'RON', symbol: 'lei', name: 'Romanian Leu' }
  };

  // Euro zone countries
  const euroZone = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'GR', 'FI', 'LU', 'MT', 'CY', 'SI', 'SK', 'EE', 'LV', 'LT', 'HR'];
  
  if (euroZone.includes(countryCode)) {
    return currencies['EU'];
  }

  return currencies[countryCode] || { code: 'USD', symbol: '$', name: 'US Dollar' };
};

/**
 * Get primary language for a country
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {object} Language info
 */
exports.getLanguageForCountry = (countryCode) => {
  const languages = {
    'US': { code: 'en', name: 'English' },
    'CA': { code: 'en', name: 'English' },
    'GB': { code: 'en', name: 'English' },
    'AU': { code: 'en', name: 'English' },
    'NZ': { code: 'en', name: 'English' },
    'IE': { code: 'en', name: 'English' },
    'ZA': { code: 'en', name: 'English' },
    'DE': { code: 'de', name: 'German' },
    'AT': { code: 'de', name: 'German' },
    'CH': { code: 'de', name: 'German' },
    'FR': { code: 'fr', name: 'French' },
    'BE': { code: 'fr', name: 'French' },
    'IT': { code: 'it', name: 'Italian' },
    'ES': { code: 'es', name: 'Spanish' },
    'MX': { code: 'es', name: 'Spanish' },
    'AR': { code: 'es', name: 'Spanish' },
    'CL': { code: 'es', name: 'Spanish' },
    'CO': { code: 'es', name: 'Spanish' },
    'PT': { code: 'pt', name: 'Portuguese' },
    'BR': { code: 'pt', name: 'Portuguese' },
    'NL': { code: 'nl', name: 'Dutch' },
    'SE': { code: 'sv', name: 'Swedish' },
    'NO': { code: 'no', name: 'Norwegian' },
    'DK': { code: 'da', name: 'Danish' },
    'FI': { code: 'fi', name: 'Finnish' },
    'PL': { code: 'pl', name: 'Polish' },
    'CZ': { code: 'cs', name: 'Czech' },
    'GR': { code: 'el', name: 'Greek' },
    'RU': { code: 'ru', name: 'Russian' },
    'UA': { code: 'uk', name: 'Ukrainian' },
    'IN': { code: 'hi', name: 'Hindi' },
    'CN': { code: 'zh', name: 'Chinese' },
    'JP': { code: 'ja', name: 'Japanese' },
    'KR': { code: 'ko', name: 'Korean' },
    'TR': { code: 'tr', name: 'Turkish' },
    'SA': { code: 'ar', name: 'Arabic' },
    'AE': { code: 'ar', name: 'Arabic' },
    'EG': { code: 'ar', name: 'Arabic' },
    'IL': { code: 'he', name: 'Hebrew' },
    'TH': { code: 'th', name: 'Thai' },
    'VN': { code: 'vi', name: 'Vietnamese' },
    'ID': { code: 'id', name: 'Indonesian' },
    'MY': { code: 'ms', name: 'Malay' },
    'PH': { code: 'tl', name: 'Tagalog' },
    'SG': { code: 'en', name: 'English' },
    'RO': { code: 'ro', name: 'Romanian' },
    'HU': { code: 'hu', name: 'Hungarian' },
    'BG': { code: 'bg', name: 'Bulgarian' },
    'HR': { code: 'hr', name: 'Croatian' },
    'RS': { code: 'sr', name: 'Serbian' },
    'SK': { code: 'sk', name: 'Slovak' },
    'SI': { code: 'sl', name: 'Slovenian' },
    'LT': { code: 'lt', name: 'Lithuanian' },
    'LV': { code: 'lv', name: 'Latvian' },
    'EE': { code: 'et', name: 'Estonian' },
    'IS': { code: 'is', name: 'Icelandic' }
  };

  return languages[countryCode] || { code: 'en', name: 'English' };
};

/**
 * Update user location in database
 * @param {number} userId - User ID
 * @param {string} ip - IP address
 * @returns {object} Updated location data
 */
exports.updateUserLocation = async (userId, ip) => {
  const locationData = this.getLocationFromIP(ip);
  
  const query = `
    UPDATE users 
    SET 
      ip_address = $1,
      country = $2,
      country_name = $3,
      region = $4,
      city = $5,
      timezone = $6,
      latitude = $7,
      longitude = $8,
      location_last_updated = NOW()
    WHERE id = $9
    RETURNING country, country_name, region, city, timezone, latitude, longitude
  `;

  const values = [
    ip,
    locationData.country,
    locationData.country_name,
    locationData.region,
    locationData.city,
    locationData.timezone,
    locationData.latitude,
    locationData.longitude,
    userId
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

/**
 * Get complete location info with currency and language
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @param {object} locationData - Basic location data
 * @returns {object} Complete location info
 */
exports.getCompleteLocationInfo = (countryCode, locationData) => {
  return {
    ...locationData,
    currency: this.getCurrencyForCountry(countryCode),
    language: this.getLanguageForCountry(countryCode)
  };
};
