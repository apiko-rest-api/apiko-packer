const path = require('path')
const fs = require('fs')
const rimraf = require('rimraf')
const exec = require('child_process').exec
const cheerio = require('cheerio')
const request = require("request")
const copy = require('recursive-copy')

let packer = {
  apikoPath: 'apiko',
  uiPath: 'apiko-ui',
  packagePath: './package',
  newVersion: '',
  oldVersion: '',

  async pack () {
    await this.updateApikoAndUi()
    await this.updateUiModules()
    await this.buildUi()
    await this.preparePackageDirectory()
    await this.transpileApiko()
    await this.getCurrentlyPublicVersion()
    await this.preparePackageJson()
    await this.integrateUi()
    await this.additionalProcessing()
    await this.done()
  },

  updateApikoAndUi () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Updating Apiko and Apiko UI...')

      let npm = exec('git submodule update --init --recursive')
      npm.stdout.pipe(process.stdout)
      npm.stderr.pipe(process.stderr)

      npm.on('close', (code) => {
        resolve()
      })
    })
  },

  updateUiModules () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Updating UI NPM modules...')

      let thisPath = process.cwd()
      process.chdir(path.normalize(packer.uiPath))

      let npm = exec('npm i')
      npm.stdout.pipe(process.stdout)
      npm.stderr.pipe(process.stderr)

      npm.on('close', (code) => {
        process.chdir(path.normalize(thisPath))
        resolve()
      })
    })
  },

  preparePackageDirectory () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Checking if package directory exists and wiping in case...')
      rimraf(packer.packagePath, () => {
        console.log('[PACKER] Creating the package directory...')
        fs.mkdirSync(packer.packagePath)
        resolve()
      })
    })
  },

  transpileApiko () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Transpiling Apiko...')

      let babel1 = exec(path.normalize('babel ' + packer.apikoPath + '/src --out-dir ' + packer.packagePath + '/src'))
      babel1.stdout.pipe(process.stdout)
      babel1.stderr.pipe(process.stderr)

      babel1.on('close', (code) => {
        let babel2 = exec(path.normalize('babel ' + packer.apikoPath + '/index.js --out-file ' + packer.packagePath + '/index.js'))
        babel2.stdout.pipe(process.stdout)
        babel2.stderr.pipe(process.stderr)

        babel2.on('close', (code) => {
          resolve()
        })
      })
    })
  },

  getCurrentlyPublicVersion () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Getting Apiko\'s current public version number...')

      request({ uri: 'https://www.npmjs.com/package/apiko' }, (error, response, body) => {
        let page = cheerio.load(body)
        packer.oldVersion = page('li.last-publisher + li').text().trim().split(' ')[0]
        resolve()
      })
    })
  },

  preparePackageJson () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Preparing package JSON...')

      let oldV = packer.oldVersion.split('.')

      if (packer.newVersion) {
        let newV = packer.newVersion.split('.')

        if (newV[0] <= oldV[0]) {
          if (newV[1] <= oldV[1]) {
            if (newV[2] <= oldV[2]) {
              console.log('[PACKER] The specified version is lower or equal to the currently published version.')
              process.exit(1)
            }
          }
        }
      } else {
        oldV[2]++
        packer.newVersion = oldV.join('.')
      }

      console.log('[PACKER] New version will be:', packer.newVersion)

      let contents = fs.readFileSync(path.normalize(packer.apikoPath + '/package.json'))
      contents = JSON.parse(contents)
      contents.version = packer.newVersion
      fs.writeFileSync(path.normalize(packer.packagePath + '/package.json'), JSON.stringify(contents))

      resolve()
    })
  },

  buildUi () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Building Apiko UI...')

      let thisPath = process.cwd()
      process.chdir(path.normalize(packer.uiPath))

      let npm = exec('npm run build')
      npm.stdout.pipe(process.stdout)
      npm.stderr.pipe(process.stderr)

      npm.on('close', (code) => {
        process.chdir(path.normalize(thisPath))
        resolve()
      })
    })
  },

  integrateUi () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Integrating Apiko UI...')

      copy(path.normalize(packer.uiPath + '/dist'), path.normalize(packer.packagePath + '/devui')).then((results) => {
        resolve()
      })
      .catch((error) => {
        console.error('[PACKER] Copy failed: ' + error)
      })
    })
  },

  additionalProcessing () {
    return new Promise((resolve, reject) => {
      console.log('[PACKER] Adding license and README...')

      fs.createReadStream(path.normalize(packer.apikoPath + '/LICENSE'))
      .pipe(fs.createWriteStream(path.normalize(packer.packagePath + '/LICENSE')))

      fs.createReadStream(path.normalize(packer.apikoPath + '/README.md'))
      .pipe(fs.createWriteStream(path.normalize(packer.packagePath + '/README.md')))

      resolve()
    })
  },

  done () {
    return new Promise((resolve, reject) => {
      console.log("[PACKER] Finished. Now login to NPM ('npm login'), go to the 'package' directory and run 'npm publish'.")
      resolve()
    })
  },
}

if (process.argv[2] != 'help') {
  packer.newVersion = process.argv[2]
  packer.pack()
} else {
  console.log('Usage:')
  console.log('node index [new_version]')
}