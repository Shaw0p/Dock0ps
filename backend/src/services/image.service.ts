import docker from '../config/docker';
import { getIO } from '../config/socket';
import prisma from '../config/database';
import { decrypt } from '../utils/crypto';


export class ImageService {
  async listImages() {
    const images = await docker.listImages();
    return images.map(img => ({
      id: img.Id,
      repoTags: img.RepoTags || ['<none>:<none>'],
      size: img.Size,
      created: img.Created,
      containers: img.Containers,
    }));
  }

  async inspectImage(id: string) {
    const image = docker.getImage(id);
    return image.inspect();
  }

  async deleteImage(id: string, force: boolean = false) {
    const image = docker.getImage(id);
    await image.remove({ force: force });
    return { id, action: 'delete', status: 'success' };
  }

  async tagImage(id: string, repo: string, tag: string) {
    const image = docker.getImage(id);
    await image.tag({ repo, tag });
    return { id, action: 'tag', repo, tag, status: 'success' };
  }

  async searchDockerHub(term: string) {
    if (!term) return [];
    const url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(term)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Docker Hub search failed: ${errText || response.statusText}`);
    }
    const data: any = await response.json();
    const results = data.results || [];

    // Fetch the latest tag for the top 10 results in parallel
    const resultsWithTags = await Promise.all(
      results.slice(0, 10).map(async (repo: any) => {
        const parts = repo.repo_name.split('/');
        const namespace = parts.length === 1 ? 'library' : parts[0];
        const name = parts.length === 1 ? parts[0] : parts[1];
        try {
          const tagUrl = `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=1`;
          const tagResponse = await fetch(tagUrl);
          if (tagResponse.ok) {
            const tagData: any = await tagResponse.json();
            const latestTag = tagData.results?.[0]?.name || 'latest';
            return {
              name: repo.repo_name,
              description: repo.short_description,
              is_official: repo.is_official,
              is_automated: repo.is_automated,
              star_count: repo.star_count,
              pull_count: repo.pull_count,
              latest_tag: latestTag,
            };
          }
        } catch (e) {
          // Fallback if tag fetch fails
        }
        return {
          name: repo.repo_name,
          description: repo.short_description,
          is_official: repo.is_official,
          is_automated: repo.is_automated,
          star_count: repo.star_count,
          pull_count: repo.pull_count,
          latest_tag: 'latest',
        };
      })
    );
    return resultsWithTags;
  }

  // Pulls an image and sends real-time progress updates over Socket.IO
  async pullImage(imageName: string, socketId?: string) {
    // Add default tag if not specified
    const fullImageName = imageName.includes(':') ? imageName : `${imageName}:latest`;

    // Extract registry URL prefix from imageName (e.g. ghcr.io or index.docker.io/v1/)
    let registryUrl = 'index.docker.io/v1/';
    if (imageName.includes('/') && (imageName.split('/')[0].includes('.') || imageName.split('/')[0].includes(':'))) {
      registryUrl = imageName.split('/')[0].toLowerCase();
    }

    let authconfig: any = undefined;
    try {
      const matchingRegistry = await prisma.registry.findFirst({
        where: {
          url: {
            contains: registryUrl,
            mode: 'insensitive',
          }
        }
      });

      if (matchingRegistry) {
        const decryptedPassword = decrypt(matchingRegistry.password);
        authconfig = {
          username: matchingRegistry.username,
          password: decryptedPassword,
          serveraddress: matchingRegistry.url,
        };
        console.log(`[Image Service] Found matching credentials for registry: ${matchingRegistry.url}`);
      }
    } catch (dbErr: any) {
      console.warn('[Image Service] Database registry credential lookup failed:', dbErr.message);
    }

    return new Promise((resolve, reject) => {
      docker.pull(fullImageName, authconfig || {}, (err, stream) => {

        if (err) {
          return reject(err);
        }
        if (!stream) {
          return reject(new Error('Pull stream is undefined'));
        }

        const io = getIO();
        const target = socketId ? io.to(socketId) : io;

        docker.modem.followProgress(
          stream,
          (finishedErr, output) => {
            if (finishedErr) {
              target.emit('pull-status', { imageName: fullImageName, status: 'error', error: finishedErr.message });
              reject(finishedErr);
            } else {
              target.emit('pull-status', { imageName: fullImageName, status: 'completed', output });
              resolve(output);
            }
          },
          (event) => {
            // event contains progress detail: { status: 'Downloading', progressDetail: { current, total }, id: 'layer-id' }
            target.emit('pull-progress', {
              imageName: fullImageName,
              id: event.id,
              status: event.status,
              progress: event.progress,
              progressDetail: event.progressDetail,
            });
          }
        );
      });
    });
  }
}
export default ImageService;
