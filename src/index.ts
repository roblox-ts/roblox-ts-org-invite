import { $, type ShellError } from "bun";
import assert from "node:assert";
import { Elysia, redirect, t } from "elysia";

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

const app = new Elysia();

app.get("/", () => "ok");

app.post(
	"/invite-to-org",
	async ({ body }) => {
		if (!(await validateCaptcha(body))) return redirect(urlParams(FAIL_URL, { reason: "Bad captcha" }));
		const { username } = body;
		try {
			await $`npm org set rbxts ${username} developer --json`;
			return redirect(urlParams(INVITE_SENT_URL, { username }));
		} catch (e) {
			const shellError = e as ShellError;
			const error = shellError.json().error.summary;
			if (error === ALREADY_IN_ORG) return redirect(SUCCESS_URL);
			if (error === ALREADY_SENT_INVITE) return redirect(urlParams(INVITE_SENT_URL, { username }));
			return redirect(urlParams(FAIL_URL, { reason: error }));
		}
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
		if (!(await validateCaptcha(body))) return redirect(urlParams(FAIL_URL, { reason: "Bad captcha" }));
		const { username } = body;
		try {
			await $`npm team create @rbxts:${username}`.nothrow();
			await $`npm team add @rbxts:${username} ${username} --json`;
			return redirect(SUCCESS_URL);
		} catch {
			return redirect(urlParams(INVITE_SENT_URL, { username }));
		}
	},
	{
		body: t.Object({
			username: t.String(),
			"g-recaptcha-response": t.String(),
		}),
	},
);

app.listen(Bun.env.PORT);

await $`npm config set //registry.npmjs.org/:_authToken=${Bun.env.NPM_TOKEN}`;
await $`npm whoami`;
