import { Request, Response } from "express";
import org from "libnpmorg";
import team from "libnpmteam";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
require("dotenv").config();

const NPM_TOKEN = { token: process.env.NPM_TOKEN! };
const BANNED_USERNAMES = process.env.BANNED_USERNAMES!.split(",");

const badRequest = (response: Response, error: string) => response.status(400).send(`Bad request: ${error}`).end();

async function addUserToOrg(username: string) {
	if (BANNED_USERNAMES.includes(username)) return false;

	const profile = await org.set("rbxts", username, "developer", NPM_TOKEN);

	const teamName = `@rbxts:${profile.user}`;

	let failed = false;

	try {
		await team.create(teamName, NPM_TOKEN);
	} catch (e) {
		failed = true;
	}

	try {
		await team.add(profile.user, teamName, NPM_TOKEN);
	} catch (e) {
		failed = true;
	}

	return !failed;
}

export async function handleRequest(request: Request, response: Response) {
	if (request.method !== "POST") return badRequest(response, "Wrong method");

	if (!request.body.username) return badRequest(response, "Missing username");

	if (await addUserToOrg(request.body.username)) {
		return response.status(301).set("location", `${process.env.SITE_URL!}/success`).end();
	}

	response.status(302).set("location", `${process.env.SITE_URL!}/fail`).end();
}
