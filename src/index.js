'use strict'

const debug = require('debug')('AWSCognitoJWTValidator')
const Joi = require('@hapi/joi')
const request = require('superagent')
const get = require('lodash.get')
const once = require('lodash.once')
const throttle = require('lodash.throttle')
const jwkToPem = require('jwk-to-pem')
const jwt = require('jsonwebtoken')
const verify = require('./verify')
const configSchema = require('./config.schema')
const { REFRESH_WAIT_MS } = require('./constants')
const {
  ConfigurationError, InitializationError, RefreshError, InvalidJWTError
} = require('./errors')

class AWSCognitoJWTValidator {
  /**
   * @constructor
   *
   * @description Instantiates a JWT validator.
   *
   * @throws {ConfigurationError} The provided configuration is invalid.
   *
   * @param {Object} config - The validator configuration.
   * @param {string} [config.region = 'us-east-1'] - The AWS Region where the Cognito User Pool was created.
   * @param {string} config.userPoolId - The Cognito User Pool ID.
   * @param {string[]} [config.tokenUse = ['access']] - The accepted token uses.
   * @param {string[]} config.audience - A set of app client IDs that have access to the Cognito User Pool.
   * @param {Object} [config.pems = null] - The custom pems to be used to verify the token signature.
   *
   * @returns {AWSCognitoJWTValidator} A validator instance.
   *
   * @example
   *
   * 'use strict';
   *
   * const AWSCognitoJWTValidator = require('aws-cognito-jwt-validator');
   *
   * const validator = new AWSCognitoJWTValidator({
   *   region: 'us-east-2',
   *   userPoolId: 'us-east-2_6IfDT7ZUq',
   *   tokenUse: ['id', 'access'],
   *   audience: ['55plsi2cl0o267lfusmgaf67pf']
   * });
   * */
  constructor(config) {
    debug('Instantiating validator with config: %O', config)
    const { error, value } = Joi.validate(config, configSchema)
    if (error) throw new ConfigurationError(error)
    Object.assign(this, value)
    this.init = once(this.initialize)
    this.refreshPems = throttle(this.refresh, REFRESH_WAIT_MS, { leading: true, trailing: false })
  }

  /**
   * @private
   *
   * @description Get the issuer for the configured User Pool.
   *
   * @returns {string} The expected value of the JWT iss claim.
   * */
  get iss() {
    return `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`
  }

  /**
   * @private
   *
   * @description Get the JWKs url for the configured User Pool.
   *
   * @returns {string} The URL where the User Pool JWKs are located.
   * */
  get jwksUrl() {
    return `${this.iss}/.well-known/jwks.json`
  }

  /**
   * @private
   *
   * @description Initializes a validator by getting the User Pool JWKs and converting them to pems.
   *
   * @returns {Promise<undefined>} A promise that will be resolved if the validator could be
   * initialized successfully. Otherwise, it will be rejected with the appropriate error.
   * */
  async initialize() {
    if (this.pems) {
      debug('Validator pems already set. Skipping http request to JWKs endpoint..')
      return
    }

    try {
      debug(`Getting JWKs from ${this.jwksUrl}`)
      const { body: { keys: jwks } } = await request.get(this.jwksUrl)
      debug('Generating pems from JWKs: %O', jwks)
      this.pems = jwks.reduce(
        (acc, jwk) => {
          acc[jwk.kid] = jwkToPem(jwk, { private: false })
          return acc
        },
        {}
      )
      debug('Validator pems set to: %O', this.pems)
    } catch (err) {
      debug('Error while setting validator pems: %O', err)
      throw new InitializationError(err)
    }
  }

  /**
   * @private
   *
   * @description Refreshes a validator pems in case JWKs were rotated.
   *
   * @returns {Promise<undefined>} A promise that will be resolved if the validator pems could be
   * refreshed successfully. Otherwise, it will be rejected with the appropriate error.
   * */
  async refresh() {
    debug('Refreshing validator pems..')
    this.pems = null

    try {
      await this.initialize()
    } catch (err) {
      throw new RefreshError(err)
    }
  }

  /**
   * @description Validates a JSON web token.
   *
   * @param {string} token - The JSON web token to validate.
   *
   * @returns {Promise<Object>} A promise that resolves to the JWT payload if the token is valid.
   * Otherwise, it will be rejected with the appropriate error.
   *
   * @example
   *
   * 'use strict';
   *
   * const AWSCognitoJWTValidator = require('aws-cognito-jwt-validator');
   *
   * const validator = new AWSCognitoJWTValidator({ ... });
   * const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
   *
   * validator.validate(token)
   *  .then(jwtPayload => console.log(jwtPayload))
   *  .catch(err => console.error(err));
   * */
  async validate(token) {
    await this.init()

    debug('Decoding JWT to get the "kid" header')
    const decodedToken = jwt.decode(token, { complete: true })

    if (!decodedToken) {
      debug('JWT is invalid')
      throw new InvalidJWTError('JWT is invalid')
    }

    const { kid } = decodedToken.header
    debug(`Getting pem for kid ${kid}`)
    let pem = get(this.pems, kid)

    if (!pem) {
      debug(`No pem found for kid ${kid}. Refreshing pems in case JWKs were rotated..`)
      await this.refreshPems()

      debug(`Getting pem for kid ${kid} after refreshing..`)
      pem = get(this.pems, kid)

      if (!pem) throw new InvalidJWTError('No pem found to verify JWT signature')
    }

    debug('Verifying JWT signature..')
    return verify(token, pem, { audience: this.audience, issuer: this.iss, tokenUse: this.tokenUse })

    // TODO: add autogenerated docs with jsdoc.
  }
}

module.exports = AWSCognitoJWTValidator
