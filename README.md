# Family Edge Export

*Export data from ancient Family Edge Plus genealogy software and convert to GEDCOM format*

## Description

:notes: Back in the '90s
![BoJack Horseman](doc/bojack.jpg)
:notes:
there was an MS-DOS genealogy program called Family Edge Plus. I entered more than 3,000
relatives (or possible relatives) into it (version 2.5b), and now years later I want to
get the data out, so I wrote these programs to export the data and convert it to GEDCOM
that can be imported elsewhere.
It's unlikely that anyone else out there is having this problem and is reading this, but
just in case I'm writing up these instructions (and maybe they'll be useful for my future
self).

These programs are written for Linux, but it might not be hard to adapt them for
OS X (using equivalents of `dosbox` and `xdotool`). Windows would be harder.


## Setup

### Program files

If you have `git` installed, you can check out the files with

    git clone https://github.com/kcivey/family-edge-export.git

Otherwise you can download and uncompress the
[zip file](https://github.com/kcivey/family-edge-export/archive/master.zip).

Copy the `lib/submitter.yaml.sample` file to `lib/submitter.yaml`, and modify the
values to be inserted into the GEDCOM file. The `id` and `name` are required
(just make up something alphanumeric for the id), but the others can be 
omitted if you don't want them (who uses fax nowadays?).

### Node.js

You'll need to install [Node.js](https://nodejs.org/), version 10 or higher. I recommend
using [NVM](https://github.com/nvm-sh/nvm), but that's not necessary.

In the directory where you checked out (or unzipped) the files, run `npm install`
to get the necessary Node.js modules.

### dosbox and xdotool

You'll also need `dosbox` (for running Family Edge) and `xdotool` (for automating
sending keystrokes to it). On Ubuntu you can install them with

    sudo apt install dosbox xdotool

After installing `dosbox`, edit the settings in the `.conf` file in `~/.dosbox`.
I'm using

    windowresolution=2000x1600
    output=opengl
    cycles=200000

I have a high-resolution screen. You may have to adjust the resolution to get the window
to be a reasonable size. The cycles need to be set so that it runs Family Edge fast,
but not so fast that it starts missing keypresses or having other problems.

### Family Edge and data files

Create a `~/dos/F-EDGE` directory and put your Family Edge files (program and data)
in it. That includes `F-EDGE.EXE` and its accompanying files and the `DATA` subdirectory.
You can use a different directory if you change the `edgeDir` constant in
`export-family-edge.js`.

## Running

To export the data, run

    ./export-family-edge-data.js

If you want to try out just exporting a few records, use the `--limit` option:

    ./export-family-edge-data.js --limit 100

If there's already an output file in the `F-EDGE/DATA` directory, the export program will
exit with an error message, to make sure you don't overwrite something you might want.
You can delete the file manually, or run the export with the `--delete` option.

If you do other things on the computer while the export is running, it can get confused
about what window it's sending keypresses to and skip exporting some records. That may
be a bug in `xdotool`. It's best to just leave the `dosbox` window active and let the
export run to completion without doing anything else. It should take only a few minutes.

The export will print the individual sheets and family group sheets to the files
`person.doc` and `family.doc`, respectively. To generate the GEDCOM from this data, run

    ./generate-gedcom.js > my-family.ged

Change `my-family.ged` to whatever you want to call the GEDCOM file.

Ancestry.com uses a somewhat nonstandard GEDCOM format. If you're planning to upload
your GEDCOM to that site, there's an option to use a format it likes better:

    ./generate-gedcom.js --ancestry > my-family.ged

If you're actually reading this and wanting to do the conversion, I might be able to
help if you contact me.
