import { Request, Response } from 'express'
import fetch from 'node-fetch'
import org from 'libnpmorg'
import team from 'libnpmteam'
import { URLSearchParams } from 'url'

require('dotenv').config()

const CAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const NPM_TOKEN = { token: process.env.NPM_TOKEN! }
const BANNED_USERNAMES = process.env.BANNED_USERNAMES!.split(',')

const badRequest = (response: Response, error: string) => (
  response.status(400).send(`Bad request: ${error}`).end()
)

async function validateCaptcha (response: string) {
  const form = new URLSearchParams()

  form.append('secret', process.env.CAPTCHA_SECRET!)
  form.append('response', response)

  const captchaResponse = await fetch(CAPTCHA_VERIFY_URL, {
    method: 'POST',
    body: form
  })

  return (await captchaResponse.json()).success === true
}

async function addUserToOrg (username: string) {
  if (BANNED_USERNAMES.includes(username)) return false

  const profile = await org.set('rbxts', username, 'developer', NPM_TOKEN)

  const teamName = `@rbxts:${profile.user}`
  await team.create(teamName, NPM_TOKEN)
  await team.add(profile.user, teamName, NPM_TOKEN)

  return true
}

export async function handleRequest (request: Request, response: Response) {
  if (request.method !== 'POST') return badRequest(response, 'Wrong method')

  if (!request.body.username) return badRequest(response, 'Missing username')

  if (!await validateCaptcha(request.body['g-recaptcha-response'])) return badRequest(response, 'Bad captcha')

  if (await addUserToOrg(request.body.username)) {
    return response.status(301).set('location', `${process.env.SITE_URL!}/success`).end()
  }

  response.status(302).set('location', `${process.env.SITE_URL!}/fail`).end()
}
