const { logger, NeutralExitError } = require("./common");
const git = require("./git");

const FETCH_TIMEOUT = 60000;

async function update(context, dir, url, pullRequest) {
  logger.info(`Updating PR #${pullRequest.number} ${pullRequest.title}`);

  if (pullRequest.merged === true) {
    logger.info("PR is already merged!");
    throw new NeutralExitError();
  }

  if (pullRequest.head.repo.full_name !== pullRequest.base.repo.full_name) {
    logger.info("PR branch is from external repository, skipping");
    throw new NeutralExitError();
  }

  const { octokit, config } = context;
  const { automerge } = config;

  let action = null;

  if (!octokit || !dir || !url) {
    throw new Error("invalid arguments!");
  }

  if (action === automerge) {
    return await merge(octokit, pullRequest);
  } else {
    throw new Error(`invalid action: ${action}`);
  }
}

async function merge(octokit, pullRequest) {
  const state = await pullRequestState(octokit, pullRequest);
  if (state === "behind") {
    const headRef = pullRequest.head.ref;
    const baseRef = pullRequest.base.ref;

    logger.debug("Merging latest changes from", baseRef, "into", headRef);
    const { status, data } = await octokit.repos.merge({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      base: headRef,
      head: baseRef
    });

    logger.trace("Merge result:", status, data);

    if (status === 204) {
      logger.info("No merge performed, branch is up to date!");
      return pullRequest.head.sha;
    } else {
      logger.info("Merge succeeded, new HEAD:", headRef, data.sha);
      return data.sha;
    }
  } else if (state === "clean" || state === "has_hooks") {
    logger.info("No update necessary");
    return pullRequest.head.sha;
  } else {
    logger.info("No update done due to PR state", state);
    throw new NeutralExitError();
  }
}

async function pullRequestState(octokit, pullRequest) {
  if (pullRequest.mergeable_state) {
    return pullRequest.mergeable_state;
  } else {
    logger.debug("Getting pull request info for", pullRequest.number, "...");
    const { data: fullPullRequest } = await octokit.pulls.get({
      owner: pullRequest.head.repo.owner.login,
      repo: pullRequest.head.repo.name,
      number: pullRequest.number
    });

    logger.trace("Full PR:", fullPullRequest);

    return fullPullRequest.mergeable_state;
  }
}

module.exports = { update };
