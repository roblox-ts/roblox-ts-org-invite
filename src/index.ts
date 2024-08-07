import { $, type ShellError } from "bun";
import assert from "node:assert";
import express, { type Response } from "express";
import bodyParser from "body-parser";

const CAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

async function validateCaptcha(response: string) {
	assert(Bun.env.CAPTCHA_SECRET, "CAPTCHA_SECRET is required");

	const parsed = await fetch(CAPTCHA_VERIFY_URL, {
		method: "POST",
		body: new URLSearchParams({
			secret: Bun.env.CAPTCHA_SECRET,
			response,
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

const success = (res: Response) => res.status(302).set("location", SUCCESS_URL).end();

const inviteSent = (res: Response, username: string) => {
	const url = new URL(INVITE_SENT_URL);
	url.searchParams.set("username", username);
	res.status(302).set("location", url.toString()).end();
};

const badRequest = (res: Response, error: string) => {
	const url = new URL(FAIL_URL);
	url.searchParams.set("reason", error);
	res.status(302).set("location", url.toString()).end();
};

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/health", (_, res) => res.send("ok"));

app.post("/invite-to-org", async (req, res) => {
	const username = req.body.username;

	if (!username) return badRequest(res, "Missing username");

	if (!(await validateCaptcha(req.body["g-recaptcha-response"]))) return badRequest(res, "Bad captcha");

	try {
		await $`npm org set rbxts ${username} developer --json`;
		return inviteSent(res, username);
	} catch (e) {
		const shellError = e as ShellError;
		const error = shellError.json().error.summary;
		if (error === ALREADY_IN_ORG) return success(res);
		if (error === ALREADY_SENT_INVITE) return inviteSent(res, username);
		return badRequest(res, error);
	}
});

app.post("/add-to-team", async (req, res) => {
	const username = req.body.username;

	if (!username) return badRequest(res, "Missing username");

	if (!(await validateCaptcha(req.body["g-recaptcha-response"]))) return badRequest(res, "Bad captcha");

	try {
		await $`npm team create @rbxts:${username}`.nothrow();
		await $`npm team add @rbxts:${username} ${username} --json`;
		return success(res);
	} catch {
		return inviteSent(res, username);
	}
});

app.listen(Bun.env.PORT);
