// AboutModal.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, Users, BookOpen, Rocket } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AboutModalProps {
  isOpen: boolean; // Add this prop
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border shadow-2xl backdrop-blur-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2 className="text-xl font-semibold text-white">
                      About iCharm
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    <p className="text-sm text-gray-400">
                      Interactive Climate and Atmospheric Research Model
                    </p>
                  </CardDescription>
                  <CardAction>
                    <button
                      onClick={onClose}
                      className="rounded-xl p-2 text-gray-400 transition-colors duration-200 hover:bg-gray-700/50 hover:text-white"
                    >
                      <X size={20} />
                    </button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {/* Introduction */}
                  <section className="space-y-4">
                    <h3 className="text-lg font-medium text-white">
                      Welcome to iCharm
                    </h3>
                    <p className="leading-relaxed text-gray-300">
                      Everyone talks about global warming or climate change, but
                      few have seen the climate data, because accessing climate
                      data can be a technically challenging task. This
                      4-Dimensional Visual Delivery of Big Climate Data (4DVD)
                      enables anyone to access climate data immediately as long
                      as the person can navigate a website. 4DVD is a unique
                      software developed at the Climate Informatics Lab, San
                      Diego State University, for the instant delivery of big
                      climate data to classrooms and households around the world
                      in a convenient and visual way. It works like an Amazon
                      audio book shopping experience. In fact, at one time 4DVD
                      partnered with Amazon and used Amazon Web Services (AWS),
                      which is a cloud service from Amazon, to store and deliver
                      the climate data. 4DVD makes the climate data acquisition
                      in the same way as one shops on Amazon for digital
                      products, such as digital books or movies. Therefore, the
                      4DVD technology can deliver the climate data instantly to
                      classrooms, museums, and households. Downloading the
                      massive amount of data, making analysis on them, or
                      requesting a server to produce a figure are among the
                      conventional practices of data acquisition in the climate
                      research community. This passive approach is slow and
                      requires climate expertise or professional data analysis
                      training. The powerful 4DVD technology has changed this
                      and enabled an active data acquisition in both visual and
                      digital forms, as if the data are delivered to the user.
                      While DVD plays movies and music, 4DVD (www.4dvd.org) is a
                      website technology that plays big data. Any person who can
                      shop on Amazon can acquire climate data from 4DVD. This
                      convenient climate data technology is achieved because the
                      4DVD big data technology optimizes the resources from
                      database, data server, and the computer browser of a
                      client. A client does not need to download an entire
                      dataset (such as 5 gigabytes data from a climate modeling
                      output) to make analysis of a desired case. Instead, users
                      run the 4DVD code on their own computer browsers to
                      visually obtain the desired data from the optimal routes
                      of database and data server, then can instantly see the
                      data as a figure, a spatial climate map or a historical
                      climate time series, and quickly determine whether this is
                      the desired climate scenario of interest. Eventually, the
                      user can choose to download the digital data for further
                      analysis or figure re-plotting. The original database idea
                      for the 4DVD was from Dr. Julien Pierret around 2010. He
                      began developing the 4DVD technology as part of his PhD
                      research during 2012-2018, directed by Samuel Shen,
                      Distinguished Professor of Mathematics and Statistics, San
                      Diego State University. Shen also developed the framework
                      of the climate data delivery system and coined the term
                      “4DVD” around 2012, when the 4DVD development formally
                      began. The beta-version was available in 2016 for
                      demonstrations. The first public demonstration was made at
                      the NOAA National Environmental Information, Asheville,
                      North Carolina, in March 2016. A paper on the 4DVD
                      technology was first published in 2017 (Pierret and Shen
                      2017). Since then, many students, researchers, and
                      technical personnel have been contributing to the further
                      development of 4DVD, under the leadership of Drs. Pierret
                      and Shen. Users are granted a non-exclusive, royalty-free
                      license to use 4DVD on this website and any data obtained
                      from using 4DVD. The software and source code for 4DVD is
                      at https://github.com/dafrenchyman/4dvd, and is available
                      for download under the GNU General Public License open
                      source license. All applicable restrictions, disclaimers
                      of warranties, and limitations of liability in the GNU
                      General Public License also apply to uses of 4DVD on this
                      website. To license 4DVD without the restrictions of the
                      GNU General Public License, such as for commercial uses,
                      please contact the San Diego State University Technology
                      Transfer Office via tto@sdsu.edu; copy Kyle Welch,
                      Licensing Manager, at kwelch@sdsu.edu. SDSU Research
                      Foundation Gateway Center 5250 Campanile Drive San Diego,
                      CA 92182 Tel: 619-594-1900 The standard academic citation
                      for this work is: Pierret, J., and S.S.P. Shen, 2017: 4D
                      visual delivery of big climate data: A fast web database
                      application system. Advances in Data Science and Adaptive
                      Analysis, 9, DOI: 10.1142/S2424922X17500061. The data
                      sources and their references are as follows: The
                      information about the NOAA-CIRES 20th Century Reanalysis
                      (20CR) (V2c) data can be found from the NOAA Physical
                      Science laboratory website
                      https://psl.noaa.gov/data/gridded/data.20thC_ReanV2c.html
                      Compo,G.P., J.S. Whitaker, and P.D. Sardeshmukh, 2006:
                      Feasibility of a 100 year reanalysis using only surface
                      pressure data. Bull. Amer. Met. Soc., 87, 175-190,
                      doi:10.1175/BAMS-87-2-175. Compo, G.P., J.S. Whitaker,
                      P.D. Sardeshmukh, N. Matsui, R.J. Allan, X. Yin, B.E.
                      Gleason, R.S. Vose, G. Rutledge, P. Bessemoulin, S.
                      Brönnimann, M. Brunet, R.I. Crouthamel, A.N. Grant, P.Y.
                      Groisman, P.D. Jones, M. Kruk, A.C. Kruger, G.J. Marshall,
                      M. Maugeri, H.Y. Mok, Ø. Nordli, T.F. Ross, R.M. Trigo,
                      X.L. Wang, S.D. Woodruff, and S.J. Worley, 2011: The
                      Twentieth Century Reanalysis Project. Quarterly J. Roy.
                      Meteorol. Soc., 137, 1-28.
                      http://dx.doi.org/10.1002/qj.776 The information about the
                      NASA Global Precipitation Climatology Project (GPCP)
                      (V2.3) data can be found from the NOAA Physical Science
                      laboratory website
                      https://psl.noaa.gov/data/gridded/data.gpcp.html Adler et
                      al., 2016. An Update (Version 2.3) of the GPCP Monthly
                      Analysis. Huffman, G.J., R.F. Adler, P. Arkin, A. Chang,
                      R. Ferraro, A. Gruber, J. Janowiak, A. McNab, B. Rudolf,
                      U. Schneider, 1997: The Global Precipitation Climatology
                      Project (GPCP) Combined Precipitation Dataset. Bull. Amer.
                      Meteor. Soc., 78(1), 5-20. Huffman, G. J., R. F. Adler, D.
                      T. Bolvin, and G. Gu (2009): Improving the global
                      precipitation record: GPCP Version 2.1, Geophys. Res.
                      Lett., 36, L17808, doi:10.1029/2009GL040000 Schneider,
                      Udo; Becker, Andreas; Finger, Peter; Meyer-Christoffer,
                      Anja; Rudolf, Bruno; Ziese, Markus (2015a): GPCC Full Data
                      Reanalysis Version 7.0 at 0.5°: Monthly Land-Surface
                      Precipitation from Rain-Gauges built on GTS-based and
                      Historic Data. DOI: 10.5676/DWD_GPCC/FD_M_V7_050.
                      Disclaimer: This program is distributed in the hope that
                      it will be useful, but WITHOUT ANY WARRANTY; without even
                      the implied warranty of MERCHANTABILITY or FITNESS FOR A
                      PARTICULAR PURPOSE. When downloading the 4DVD software,
                      one should have received a copy of the GNU General Public
                      License along with this program; if not, write to the Free
                      Software Foundation, Inc., 59 Temple Place, Suite 330,
                      Boston, MA 02111-1307 USA This project was generated with
                      Angular CLI version 1.0.1. One can redistribute it and/or
                      modify 4DVD under the terms of the GNU General Public
                      License v3 as published by the Free Software Foundation.
                      If not stated otherwise, this applies to all files
                      contained in the 4DVD package and its sub-directories
                      (with the exception of the "node_modules" folder; the
                      libraries used as part of the 4DVD may involve different
                      licenses.)
                    </p>
                  </section>

                  {/* Features */}
                  <section className="space-y-4">
                    <h3 className="text-lg font-medium text-white">
                      Key Features
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="flex items-start gap-3 rounded-lg bg-gray-800/30 p-3">
                        <Globe className="mt-0.5 h-5 w-5 text-blue-400" />
                        <div>
                          <h4 className="font-medium text-white">
                            Interactive Globe
                          </h4>
                          <p className="text-sm text-gray-400">
                            Explore data on a 3D globe with intuitive controls
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-gray-800/30 p-3">
                        <BookOpen className="mt-0.5 h-5 w-5 text-green-400" />
                        <div>
                          <h4 className="font-medium text-white">
                            Multiple Datasets
                          </h4>
                          <p className="text-sm text-gray-400">
                            Access various climate and atmospheric datasets
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-gray-800/30 p-3">
                        <Users className="mt-0.5 h-5 w-5 text-purple-400" />
                        <div>
                          <h4 className="font-medium text-white">
                            Time Series Analysis
                          </h4>
                          <p className="text-sm text-gray-400">
                            Compare and analyze data across different time
                            periods
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-gray-800/30 p-3">
                        <Rocket className="mt-0.5 h-5 w-5 text-orange-400" />
                        <div>
                          <h4 className="font-medium text-white">
                            AI Assistant
                          </h4>
                          <p className="text-sm text-gray-400">
                            Get insights and answers about your data
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                </CardContent>
                <CardFooter>
                  <div className="text-sm text-gray-400">© 2025 iCharm</div>
                  <div className="text-sm text-gray-400">Version 1.0.0</div>
                </CardFooter>
              </Card>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AboutModal;
