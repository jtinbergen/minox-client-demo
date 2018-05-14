
const express = require('express');
const passport = require('passport');
const superagent = require('superagent');
const session = require('express-session');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const ngrok = require('ngrok');

// ************************************************************
// ************************************************************
//
// CHANGE THESE TO MATCH YOUR OWN CLIENT CREDENTIALS AND DOMAIN
//
// ************************************************************
// ************************************************************
const MINOXDOMAIN = 'https://acc.minox.nl';
let CLIENTDOMAIN = '';
const CLIENTID = '';
const CLIENTSECRET = '';
const REQUESTEDSCOPES = 'administration:read supplier:read customer:read ledger_account:read journal:read vat:read transaction:read transaction:write';
const opn = require('opn');

process.on('unhandledRejection', (error) => {
  console.error(error);
});

if (!CLIENTSECRET || !CLIENTID) {
  console.log('The application cannot start until CLIENTSECRET and CLIENTID are set.');
  process.exit(-1);
}

const app = express();
app.use(session({
    secret: CLIENTSECRET
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

const getProfile = async accessToken => {
  let profile = null;
  try {
    const reply = await superagent
      .get(`${MINOXDOMAIN}/api/1/inspect/${accessToken}`)
      .auth(CLIENTID, CLIENTSECRET);
    profile = reply.body;
  } catch (e) {
    console.error(e);
  }

  return profile;
};

const minoxStrategy = new OAuth2Strategy(
    {
      authorizationURL: `${MINOXDOMAIN}/oauth/authorize`,
      tokenURL: `${MINOXDOMAIN}/oauth/token`,
      clientID: CLIENTID,
      clientSecret: CLIENTSECRET,
      callbackURL: `${CLIENTDOMAIN}/connect/minox/success`,
      scope: REQUESTEDSCOPES
    },
    async function(accessToken, refreshToken, profile, callback) {
      return callback(null, { token: accessToken, ...(await getProfile(accessToken)) });
    }
  );

passport.use(minoxStrategy);

const authenticated = (request, response, next) => {
    if (request.user) {
        next();
        return;
    }

    response.redirect('/connect/minox');
};

const getAdministrations = async (token, tenantId) => {
    const reply = await superagent
        .get(`${MINOXDOMAIN}/api/1/tenant/${tenantId}/administration`)
        .set({
            'authorization': `bearer ${token}`
        });
    return reply.body;
}

app.get('/', async (request, response) => {
  console.log(request);
  let html = '<!DOCTYPE html><html><head><title>Minox client demo</title></head><body><h1>Welkom bij Minox client demo</h1>';
  if (request.user && request.user.token) {
    html += '<a href="/dashboard">Dashboard tonen</a>';
  } else {
    html += '<a href="/dashboard">Koppeling met Minox maken</a>';
  }
  html += '</body></html>';
  response.send(html);
});
app.get('/connect/minox', passport.authenticate('oauth2'));
app.get('/connect/minox/success', passport.authenticate('oauth2', { failureRedirect: '/login' }), (request, response) => { response.redirect('/'); });
app.get('/dashboard', authenticated, async (request, response) => {
  try {
    let administrations = [];
    for (const tenant of request.user.linked_tenants) {
      let tenantAdministrations = (await getAdministrations(request.user.token, tenant.tenant_id)).collection;
      tenantAdministrations = tenantAdministrations.map(administration => ({ ...tenant, ...administration }));
      administrations.push(...tenantAdministrations)
    }

    let html = '<!DOCTYPE html><html><head><title>Minox client demo</title></head><body><h1>Welkom bij Minox client demo</h1><h2>We kunnen met de onderstaande tenants/administraties verbinden</h2><table><thead><tr><th>TenantID</th><th>AdministrationID</th><th>Company name</th><th>Number of periods</th><th>Chamber of commerce</th></tr></thead><tbody>';
    html += administrations.map(administration => `<tr><td>${administration.tenant_id}</td><td>${administration.id}</td><td>${administration.name || ''}</td><td>${administration.number_of_periods}</td><td>${administration.chamber_of_commerce || ''}</td></tr>`).join('');
    html += '</tbody></table></body></html>'
    response.send(html);
  }
  catch (e) {
    response.send(e);
  }
});

(async () => {
  CLIENTDOMAIN = await ngrok.connect();
  app.listen(7788, () => {
    console.log(`Service is up on port 7788. Client domain = ${CLIENTDOMAIN}`);
    opn('http://localhost:7788');
  });
})();
