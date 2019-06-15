'use strict'

const { expect, chance } = require('./index')
const { generateConfig } = require('./util')
const AWSCognitoJWTValidator = require('../src')
const { DEFAULT_AWS_REGION, TOKEN_USE } = require('../src/constants')
const { ConfigurationError } = require('../src/errors')

describe('Validator', () => {
  describe('Constructor', () => {
    let config

    beforeEach(() => {
      config = generateConfig()
    })

    it('Should throw ConfigurationError if no config is passed', () => {
      expect(() => new AWSCognitoJWTValidator()).to.throw(ConfigurationError, /"value" is required/)
    })

    it('Should throw ConfigurationError if config is not an object', () => {
      expect(() => new AWSCognitoJWTValidator(chance.word())).to.throw(ConfigurationError, /"value" must be an object/)
    })

    it('Should throw ConfigurationError if region is not a string', () => {
      config.region = chance.natural()
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"region" must be a string/)
    })

    it(`Should have a default region with value "${DEFAULT_AWS_REGION}"`, () => {
      Reflect.deleteProperty(config, 'region')
      const validator = new AWSCognitoJWTValidator(config)
      expect(validator).to.have.property('region', DEFAULT_AWS_REGION)
    })

    it('Should throw ConfigurationError if no userPoolId is passed', () => {
      Reflect.deleteProperty(config, 'userPoolId')
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"userPoolId" is required/)
    })

    it('Should throw ConfigurationError if userPoolId is not a string', () => {
      config.userPoolId = chance.natural()
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"userPoolId" must be a string/)
    })

    it('Should throw ConfigurationError if tokenUse is not an array', () => {
      config.tokenUse = chance.natural()
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"tokenUse" must be an array/)
    })

    it('Should throw ConfigurationError if tokenUse is an empty array', () => {
      config.tokenUse = []
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(
        ConfigurationError,
        /"tokenUse" must contain at least 1 item/
      )
    })

    it('Should throw ConfigurationError if tokenUse has repeated items', () => {
      config.tokenUse = [TOKEN_USE.ACCESS, TOKEN_USE.ID, TOKEN_USE.ACCESS]
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /contains a duplicate value/)
    })

    it('Should throw ConfigurationError if tokenUse has invalid items', () => {
      config.tokenUse = [TOKEN_USE.ACCESS, chance.word()]
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /must be one of \[id, access]$/)
    })

    it(`Should have a default tokenUse with value ${[TOKEN_USE.ACCESS]}`, () => {
      Reflect.deleteProperty(config, 'tokenUse')
      const validator = new AWSCognitoJWTValidator(config)
      expect(validator).to.have.property('tokenUse').that.is.deep.equal([TOKEN_USE.ACCESS])
    })

    it('Should throw ConfigurationError if audience is not an array', () => {
      config.audience = chance.natural()
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"audience" must be an array/)
    })

    it('Should throw ConfigurationError if audience is an empty array', () => {
      config.audience = []
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(
        ConfigurationError,
        /"audience" must contain at least 1 item/
      )
    })

    it('Should throw ConfigurationError if audience has repeated items', () => {
      const appId = chance.hash()
      config.audience = [appId, chance.hash(), appId]
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /contains a duplicate value/)
    })

    it('Should throw ConfigurationError if audience has invalid items', () => {
      config.audience = [chance.hash(), chance.natural()]
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /must be a string/)
    })

    it('Should throw ConfigurationError if no audience is passed', () => {
      Reflect.deleteProperty(config, 'audience')
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(ConfigurationError, /"audience" is required/)
    })

    //   pems: Joi.object().min(1).default(null)

    it('Should throw ConfigurationError if providing an unknown config', () => {
      const propName = chance.word()
      config[propName] = chance.sentence()
      expect(() => new AWSCognitoJWTValidator(config)).to.throw(
        ConfigurationError,
        new RegExp(`"${_.escapeRegExp(propName)}" is not allowed`)
      )
    })

    it('Should instantiate the validator', () => {
      const validator = new AWSCognitoJWTValidator(config)
      expect(validator).to.be.an.instanceof(AWSCognitoJWTValidator)
      expect(_.pick(validator, ['region', 'userPoolId', 'tokenUse', 'tokenExpirationInSeconds'])).to.deep.equal(config)
    })
  })

  describe('Getters', () => {
    let config

    beforeEach(() => {
      config = generateConfig()
    })

    it('Should return the correct issuer for the configured User Pool', () => {
      const validator = new AWSCognitoJWTValidator(config)
      expect(validator.iss).to.equal(`https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`)
    })

    it('Should return the correct JWKs url for the configured User Pool', () => {
      const validator = new AWSCognitoJWTValidator(config)
      expect(validator.jwksUrl).to.equal(
        `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`
      )
    })
  })
})
