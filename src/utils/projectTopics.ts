import { ProjectTag, Repo } from "../types";
import { PROJECT_COLORS } from "./projectColors";

export interface RepoTopicsSource {
  full_name: string;
  topics: string[];
}

const PROJECT_TOPIC_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function normalizeProjectTopicName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  assertValidProjectTopicName(normalized);
  return normalized;
}

export function assertValidProjectTopicName(value: string): asserts value is string {
  if (!PROJECT_TOPIC_PATTERN.test(value)) {
    throw new Error(`Invalid GitHub topic "${value}". Topics must be lowercase alphanumeric slugs with hyphens and at most 50 characters.`);
  }
  return void 0;
}

function colorIndexForTopic(topic: string): number {
  let hash = 0;
  for (let index = 0; index < topic.length; index += 1) {
    hash = (hash * 31 + topic.charCodeAt(index)) >>> 0;
  }
  return hash % PROJECT_COLORS.length;
}

function topicColor(topic: string): string {
  return PROJECT_COLORS[colorIndexForTopic(topic)];
}

export function deriveProjectTagsFromRepos(repos: RepoTopicsSource[]): ProjectTag[] {
  const repoNamesByTopic = new Map<string, string[]>();

  repos.forEach((repo) => {
    repo.topics.forEach((topic) => {
      const reposForTopic = repoNamesByTopic.get(topic) ?? [];
      reposForTopic.push(repo.full_name);
      repoNamesByTopic.set(topic, reposForTopic);
      return void 0;
    });
    return void 0;
  });

  return [...repoNamesByTopic.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([topic, repoNames]) => ({
      id: topic,
      name: topic,
      color: topicColor(topic),
      repos: repoNames.sort((left, right) => left.localeCompare(right))
    }));
}

export function deriveProjectTagsFromWorkspaceRepos(repos: Repo[]): ProjectTag[] {
  return deriveProjectTagsFromRepos(repos);
}
