import { $, type ShellError } from "bun";
import assert from "node:assert";
import { Elysia, redirect, t } from "elysia";
import pino from "pino";

const logger = pino({ name: "roblox-ts-org-invite" });

assert(Bun.env.PORT, "PORT is required");
assert(Bun.env.NPM_TOKEN, "NPM_TOKEN is required");

const CAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

async function validateCaptcha(body: { "g-recaptcha-response": string }) {
	assert(Bun.env.CAPTCHA_SECRET, "CAPTCHA_SECRET is required");

	const parsed = await fetch(CAPTCHA_VERIFY_URL, {
		method: "POST",
		body: new URLSearchParams({
			secret: Bun.env.CAPTCHA_SECRET,
			response: body["g-recaptcha-response"],
		}),
	}).then(res => res.json());

	assert(typeof parsed === "object" && parsed && "success" in parsed, "Invalid captcha response");
	return parsed.success === true;
}

const INVITE_SENT_URL = `${Bun.env.SITE_URL}/invite-sent`;
const SUCCESS_URL = `${Bun.env.SITE_URL}/success`;
const FAIL_URL = `${Bun.env.SITE_URL}/fail`;

const ALREADY_IN_ORG =
	"409 Conflict - PUT https://registry.npmjs.org/-/org/rbxts/user - User/Email is already a part of organization";
const ALREADY_SENT_INVITE =
	"409 Conflict - PUT https://registry.npmjs.org/-/org/rbxts/user - User/Email already has a pending invite";

function urlParams(url: string, params: { [K in string]: string }) {
	const parsed = new URL(url);
	for (const [key, value] of Object.entries(params)) {
		parsed.searchParams.set(key, value);
	}
	return parsed.toString();
}

async function addToTeam(username: string) {
	try {
		await $`npm team create @rbxts:${username}`.quiet().nothrow();
		await $`npm team add @rbxts:${username} ${username} --json`.quiet();
		logger.info({ username }, "added to team");
		return redirect(SUCCESS_URL);
	} catch (e) {
		logger.error({ username, err: e }, "failed to add to team");
		return redirect(urlParams(INVITE_SENT_URL, { username }));
	}
}

async function inviteToOrg(username: string) {
	try {
		await $`npm org set rbxts ${username} developer --json`.quiet();
		logger.info({ username }, "invited to org");
		return redirect(urlParams(INVITE_SENT_URL, { username }));
	} catch (e) {
		const shellError = e as ShellError;
		const error = shellError.json().error.summary;
		if (error === ALREADY_IN_ORG) {
			logger.info({ username }, "already in org, adding to team");
			return await addToTeam(username);
		}
		if (error === ALREADY_SENT_INVITE) {
			logger.info({ username }, "invite already pending");
			return redirect(urlParams(INVITE_SENT_URL, { username }));
		}
		logger.error({ username, error }, "failed to invite to org");
		return redirect(urlParams(FAIL_URL, { reason: error }));
	}
}

const app = new Elysia();

app.get("/", () => "ok");

app.post(
	"/invite-to-org",
	async ({ body }) => {
		if (!(await validateCaptcha(body))) {
			logger.warn({ username: body.username }, "captcha validation failed");
			return redirect(urlParams(FAIL_URL, { reason: "Bad captcha" }));
		}
		logger.info({ username: body.username }, "invite-to-org requested");
		return await inviteToOrg(body.username);
	},
	{
		body: t.Object({
			username: t.String(),
			"g-recaptcha-response": t.String(),
		}),
	},
);

app.post(
	"/add-to-team",
	async ({ body }) => {
		if (!(await validateCaptcha(body))) {
			logger.warn({ username: body.username }, "captcha validation failed");
			return redirect(urlParams(FAIL_URL, { reason: "Bad captcha" }));
		}
		logger.info({ username: body.username }, "add-to-team requested");
		return await addToTeam(body.username);
	},
	{
		body: t.Object({
			username: t.String(),
			"g-recaptcha-response": t.String(),
		}),
	},
);

app.listen(Bun.env.PORT);
logger.info({ port: Bun.env.PORT }, "server started");

await $`npm config set //registry.npmjs.org/:_authToken=${Bun.env.NPM_TOKEN}`.quiet();
const npmUser = await $`npm whoami`.quiet().text();
logger.info({ npmUser: npmUser.trim() }, "npm authenticated");
