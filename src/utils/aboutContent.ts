// aboutContent.ts
export const aboutContent = {
  title: 'About 4DVD',

  sections: {
    newUser: {
      title: 'New to 4DVD?',
      buttonText: 'Check out the 4DVD tutorials here!',
    },

    introduction: [
      'Everyone talks about global warming or climate change, but few have seen the climate data, because accessing climate data can be a technically challenging task. This 4-Dimensional Visual Delivery of Big Climate Data (4DVD) enables anyone to access climate data immediately as long as the person can navigate a website.',

      '4DVD is a unique software developed at the Climate Informatics Lab, San Diego State University, for the instant delivery of big climate data to classrooms and households around the world in a convenient and visual way. It works like an Amazon audio book shopping experience. In fact, at one time 4DVD partnered with Amazon and used Amazon Web Services (AWS), which is a cloud service from Amazon, to store and deliver the climate data.',

      '4DVD makes the climate data acquisition in the same way as one shops on Amazon for digital products, such as digital books or movies. Therefore, the 4DVD technology can deliver the climate data instantly to classrooms, museums, and households.',

      'Downloading the massive amount of data, making analysis on them, or requesting a server to produce a figure are among the conventional practices of data acquisition in the climate research community. This passive approach is slow and requires climate expertise or professional data analysis training. The powerful 4DVD technology has changed this and enabled an active data acquisition in both visual and digital forms, as if the data are delivered to the user. While DVD plays movies and music, 4DVD (www.4dvd.org) is a website technology that plays big data. Any person who can shop on Amazon can acquire climate data from 4DVD.',

      'This convenient climate data technology is achieved because the 4DVD big data technology optimizes the resources from database, data server, and the computer browser of a client. A client does not need to download an entire dataset (such as 5 gigabytes data from a climate modeling output) to make analysis of a desired case. Instead, users run the 4DVD code on their own computer browsers to visually obtain the desired data from the optimal routes of database and data server, then can instantly see the data as a figure, a spatial climate map or a historical climate time series, and quickly determine whether this is the desired climate scenario of interest. Eventually, the user can choose to download the digital data for further analysis or figure re-plotting.',

      'The original database idea for the 4DVD was from Dr. Julien Pierret around 2010. He began developing the 4DVD technology as part of his PhD research during 2012-2018, directed by Samuel Shen, Distinguished Professor of Mathematics and Statistics, San Diego State University. Shen also developed the framework of the climate data delivery system and coined the term "4DVD" around 2012, when the 4DVD development formally began. The beta-version was available in 2016 for demonstrations. The first public demonstration was made at the NOAA National Environmental Information, Asheville, North Carolina, in March 2016. A paper on the 4DVD technology was first published in 2017 (Pierret and Shen 2017). Since then, many students, researchers, and technical personnel have been contributing to the further development of 4DVD, under the leadership of Drs. Pierret and Shen.',

      'Users are granted a non-exclusive, royalty-free license to use 4DVD on this website and any data obtained from using 4DVD.',

      'The software and source code for 4DVD is at https://github.com/dafrenchyman/4dvd, and is available for download under the GNU General Public License open source license. All applicable restrictions, disclaimers of warranties, and limitations of liability in the GNU General Public License also apply to uses of 4DVD on this website. To license 4DVD without the restrictions of the GNU General Public License, such as for commercial uses, please contact the San Diego State University Technology Transfer Office via tto@sdsu.edu; copy Kyle Welch, Licensing Manager, at kwelch@sdsu.edu.',
    ],

    contact: {
      title: 'Contact Information',
      organization: 'SDSU Research Foundation',
      address: [
        'Gateway Center',
        '5250 Campanile Drive',
        'San Diego, CA 92182',
        'Tel: 619-594-1900',
      ],
    },

    citation: {
      title: 'The standard academic citation for this work is:',
      text: 'Pierret, J., and S.S.P. Shen, 2017: 4D visual delivery of big climate data: A fast web database application system. Advances in Data Science and Adaptive Analysis, 9, DOI: 10.1142/S2424922X17500061.',
    },

    dataSources: {
      title: 'Data Sources and References',
      sources: [
        {
          title: 'NOAA-CIRES 20th Century Reanalysis (20CR) (V2c)',
          url: 'https://psl.noaa.gov/data/gridded/data.20thC_ReanV2c.html',
          citation:
            'Compo, G.P., J.S. Whitaker, and P.D. Sardeshmukh, 2006: Feasibility of a 100 year reanalysis using only surface pressure data. Bull. Amer. Met. Soc., 87, 175-190, doi:10.1175/BAMS-87-2-175.',
          bgColor: 'bg-blue-800/30',
          borderColor: 'border-blue-600/30',
        },
        {
          title: 'NASA Global Precipitation Climatology Project (GPCP) (V2.3)',
          url: 'https://psl.noaa.gov/data/gridded/data.gpcp.html',
          citation:
            'Huffman, G.J., R.F. Adler, P. Arkin, A. Chang, R. Ferraro, A. Gruber, J. Janowiak, A. McNab, B. Rudolf, U. Schneider, 1997: The Global Precipitation Climatology Project (GPCP) Combined Precipitation Dataset. Bull. Amer. Meteor. Soc., 78(1), 5-20.',
          bgColor: 'bg-purple-800/30',
          borderColor: 'border-purple-600/30',
        },
      ],
    },

    disclaimer: {
      title: 'Disclaimer:',
      paragraphs: [
        'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.',
        'When downloading the 4DVD software, one should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307 USA.',
        'One can redistribute it and/or modify 4DVD under the terms of the GNU General Public License v3 as published by the Free Software Foundation.',
      ],
    },
  },

  links: {
    website: 'https://www.4dvd.org',
    github: 'https://github.com/dafrenchyman/4dvd',
    emails: {
      tto: 'tto@sdsu.edu',
      licensing: 'kwelch@sdsu.edu',
    },
  },
};
