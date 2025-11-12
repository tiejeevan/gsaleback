const fetch = require('node-fetch');

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE = 'https://newsapi.org/v2';

// Cache for news articles (5 minutes for testing, increase to 30 for production)
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class NewsService {
  getCacheKey(type, params) {
    return `${type}_${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
    cache.delete(key);
    return null;
  }

  setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
  }

  async fetchNews(endpoint, params = {}) {
    const url = new URL(`${NEWS_API_BASE}${endpoint}`);
    url.searchParams.append('apiKey', NEWS_API_KEY);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    console.log('Fetching news from:', url.toString().replace(NEWS_API_KEY, 'API_KEY_HIDDEN'));

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      console.error('NewsAPI error:', response.status, errorText);
      throw new Error(`NewsAPI error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Received ${data.articles?.length || 0} articles`);
    return data.articles || [];
  }

  async getWorldNews(country = 'us', limit = 5) {
    const cacheKey = this.getCacheKey('world', { country, limit });
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`Returning cached world news for country: ${country}`);
      return cached;
    }

    console.log(`Fetching fresh world news for country: ${country}`);
    
    // Countries supported by /top-headlines endpoint (NewsAPI free tier)
    const supportedCountries = ['ae', 'ar', 'at', 'au', 'be', 'bg', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'cz', 'de', 'eg', 'fr', 'gb', 'gr', 'hk', 'hu', 'id', 'ie', 'il', 'in', 'it', 'jp', 'kr', 'lt', 'lv', 'ma', 'mx', 'my', 'ng', 'nl', 'no', 'nz', 'ph', 'pl', 'pt', 'ro', 'rs', 'ru', 'sa', 'se', 'sg', 'si', 'sk', 'th', 'tr', 'tw', 'ua', 'us', 've', 'za'];
    
    let articles;
    const countryLower = country.toLowerCase();
    
    if (supportedCountries.includes(countryLower)) {
      // Try top-headlines first
      articles = await this.fetchNews('/top-headlines', {
        country: countryLower,
        pageSize: limit,
      });
      
      // If no articles, fallback to /everything with sources from that country
      if (!articles || articles.length === 0) {
        console.log(`No articles from top-headlines, trying /everything with sources for ${country}`);
        
        // Map countries to their news source domains
        const countrySources = {
          'in': 'timesofindia.indiatimes.com,hindustantimes.com,indianexpress.com,ndtv.com,thehindu.com',
          'gb': 'bbc.co.uk,theguardian.com,independent.co.uk,telegraph.co.uk,dailymail.co.uk',
          'ca': 'cbc.ca,globalnews.ca,thestar.com,nationalpost.com',
          'au': 'abc.net.au,smh.com.au,news.com.au,theage.com.au',
          'de': 'spiegel.de,bild.de,welt.de,faz.net,sueddeutsche.de',
          'fr': 'lemonde.fr,lefigaro.fr,liberation.fr,20minutes.fr',
          'it': 'corriere.it,repubblica.it,lastampa.it,ilsole24ore.com',
          'es': 'elpais.com,elmundo.es,abc.es,lavanguardia.com',
          'jp': 'asahi.com,mainichi.jp,yomiuri.co.jp,nikkei.com',
          'br': 'folha.uol.com.br,globo.com,estadao.com.br,uol.com.br',
          'mx': 'eluniversal.com.mx,reforma.com,milenio.com,excelsior.com.mx',
          'ar': 'clarin.com,lanacion.com.ar,pagina12.com.ar,infobae.com',
          'za': 'news24.com,iol.co.za,timeslive.co.za,mg.co.za',
          'ae': 'khaleejtimes.com,thenational.ae,gulfnews.com',
          'cn': 'chinadaily.com.cn,globaltimes.cn,scmp.com',
          'ru': 'rt.com,tass.com,themoscowtimes.com',
          'sa': 'arabnews.com,saudigazette.com.sa',
          'eg': 'egypttoday.com,ahram.org.eg,dailynewssegypt.com',
          'ng': 'punchng.com,vanguardngr.com,thenationonlineng.net',
          'ph': 'inquirer.net,rappler.com,philstar.com,abs-cbn.com',
          'id': 'thejakartapost.com,kompas.com,tempo.co',
          'th': 'bangkokpost.com,nationthailand.com',
          'my': 'thestar.com.my,nst.com.my,malaymail.com',
          'sg': 'straitstimes.com,channelnewsasia.com,todayonline.com',
          'hk': 'scmp.com,thestandard.com.hk',
          'tw': 'taipeitimes.com,focustaiwan.tw',
          'tr': 'hurriyetdailynews.com,dailysabah.com',
          'pl': 'polsatnews.pl,onet.pl',
          'nl': 'nos.nl,telegraaf.nl,volkskrant.nl',
          'be': 'vrt.be,standaard.be,lesoir.be',
          'se': 'svd.se,dn.se,aftonbladet.se',
          'no': 'vg.no,dagbladet.no,aftenposten.no',
          'ch': 'swissinfo.ch,nzz.ch',
          'at': 'derstandard.at,diepresse.com',
          'ie': 'irishtimes.com,independent.ie,rte.ie',
          'pt': 'publico.pt,jn.pt,dn.pt',
          'gr': 'ekathimerini.com,tovima.gr',
          'cz': 'idnes.cz,novinky.cz',
          'ro': 'hotnews.ro,digi24.ro',
          'hu': 'index.hu,444.hu',
          'ua': 'kyivpost.com,unian.info',
        };
        
        const sources = countrySources[countryLower];
        
        if (sources) {
          // Try with specific sources from that country
          articles = await this.fetchNews('/everything', {
            domains: sources,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: limit,
          });
        }
        
        // If still no articles, fallback to country name search
        if (!articles || articles.length === 0) {
          console.log(`No articles from sources, trying country name search for ${country}`);
          const countryNames = {
            'in': 'India',
            'us': 'United States',
            'gb': 'United Kingdom',
            'ca': 'Canada',
            'au': 'Australia',
            'de': 'Germany',
            'fr': 'France',
            'it': 'Italy',
            'es': 'Spain',
            'jp': 'Japan',
            'kr': 'South Korea',
            'br': 'Brazil',
            'mx': 'Mexico',
            'ar': 'Argentina',
            'za': 'South Africa',
          };
          
          const countryName = countryNames[countryLower] || country;
          articles = await this.fetchNews('/everything', {
            q: countryName,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: limit,
          });
        }
      }
    } else {
      // Use /everything for unsupported countries
      articles = await this.fetchNews('/everything', {
        q: country,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: limit,
      });
    }

    this.setCache(cacheKey, articles);
    return articles;
  }

  async getRegionalNews(country = 'us', limit = 5) {
    const cacheKey = this.getCacheKey('regional', { country, limit });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const articles = await this.fetchNews('/top-headlines', {
      country: country.toLowerCase(),
      pageSize: limit,
    });

    this.setCache(cacheKey, articles);
    return articles;
  }

  async getSportsNews(params = {}) {
    const { country, sport, scope = 'worldwide', limit = 5 } = params;
    const cacheKey = this.getCacheKey('sports', params);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let articles;
    
    if (sport && sport !== 'all') {
      // Specific sport query
      articles = await this.fetchNews('/everything', {
        q: sport,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: limit,
      });
    } else if (scope === 'regional' && country) {
      // Regional sports
      const query = 'sports';
      articles = await this.fetchNews('/everything', {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: limit,
      });
    } else {
      // Worldwide sports
      articles = await this.fetchNews('/top-headlines', {
        category: 'sports',
        language: 'en',
        pageSize: limit,
      });
    }

    this.setCache(cacheKey, articles);
    return articles;
  }

  async getEntertainmentNews(limit = 5) {
    const cacheKey = this.getCacheKey('entertainment', { limit });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const articles = await this.fetchNews('/top-headlines', {
      category: 'entertainment',
      language: 'en',
      pageSize: limit,
    });

    this.setCache(cacheKey, articles);
    return articles;
  }
}

module.exports = new NewsService();
