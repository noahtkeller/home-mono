import { dirname, join } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { Octokit } from '@octokit/core';
import simpleGit from 'simple-git';

const path = dirname(import.meta.url).replace(/^file:\/\//, '');
const { API_KEY, user = 'noahtkeller' } = process.env;
const octokit = new Octokit({ auth: API_KEY });

async function updateRepoDescription(url, description) {
  const [, rawName] = url.replace(/\n/g, '').match(/noahtkeller\/([a-zA-Z0-9._-]+)$/);
  const repoName = rawName.replace(/\.git$/, '')
  await octokit.request('PATCH /repos/:user/:repoName', { user, repoName, description });
}

async function readDirectory(dirName = path) {
  const fileFilter = (file) => !/^(\.|node_modules|Makefile|packer_cache|build|data)$/.test(file)
  return readdir(dirName)
    .then((contents) => contents.filter(fileFilter))
    .then((files) => files.map((file) => ({ path: join(dirName, file), file })))
    .then((files) => files.map((file) => stat(file.path).then((stats) => ({ ...file, stats }))))
    .then((promises) => Promise.all(promises));
}

async function updateDescriptionsFromPackage(files, recurse = 0) {
  const filtered = files.filter(({ stats, file }) => file === 'package.json' || stats.isDirectory());
  for (const { file, path, stats } of filtered) {
    switch (true) {
      case file === 'package.json': {
        const contents = await readFile(path, 'utf8').then(JSON.parse).catch(() => false);
        if (contents?.repository) {
          await updateRepoDescription(contents.repository.url, contents.description, 'package.json');
        } else {
          console.log('\n%s package.json has no repository information\n', contents.name);
        }
        break;
      }
      case stats.isDirectory() && recurse < 2: {
        const subFiles = await readDirectory(path);
        await updateDescriptionsFromPackage(subFiles, recurse + 1);
        break;
      }
    }
  }
}

async function updateDescriptionsFromReadme(files, recurse = 0) {
  const filtered = await Promise.all(files
    .filter(({stats}) => stats.isDirectory())
    .map(({path, ...file}) => readdir(path).then((kids) => ({...file, path, kids}))))
    .then((files) => files.filter(({kids}) => kids.includes('README.md') && !kids.includes('package.json')))
    .then((files) => files.map(({ path, file }) => ({ readme: join(path, 'README.md'), path, file })))
    .then((files) => files.map((f) => {
      return readFile(f.readme, 'utf8')
        .then((contents) => ({
          ...f,
          description: contents
            .split('\n')
            .filter((f) => f)
            .reduce((acc, line) => {
              if (!acc.start && line.startsWith('#')) {
                acc.start = true;
                return acc;
              }
              if (!acc.end && !line.startsWith('#')) {
                acc.val.push(line);
              }
              return acc;
            }, { val: [], start: false, end: false })
            .val.join('\n')
        }))
    }))
    .then((files) => Promise.all(files))
    .then((files) => files.map((f) => simpleGit(f.path).listRemote(['--get-url']).then((url) => Object.assign(f, { url }))))
    .then((files) => Promise.all(files))
  for (const { url, description } of filtered) {
    await updateRepoDescription(url, description, 'README.md');
  }
  // console.log(filtered);
}

export async function updateGithubDescriptions() {
  const files = await readDirectory();
  await updateDescriptionsFromPackage(files);
  await updateDescriptionsFromReadme(files);
}
